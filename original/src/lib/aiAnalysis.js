// DealUW AI Analysis — Sends deal data to Claude Haiku for smart analysis
// Uses process.env.ANTHROPIC_API_KEY

import { COMP_RULES, ADJUSTMENTS } from './compRules.js';

const SYSTEM_PROMPT = `You are a professional real estate appraiser and wholesaling expert. You follow strict appraisal standards. Be specific. Use numbers. No fluff.`;

function buildPrompt(dealData) {
  const {
    subject, compsUsed, compsDisqualified, arvResult, maoResult,
    repairEstimate, repairBreakdown,
  } = dealData;

  const subjectLines = [
    `Address: ${subject.address}, ${subject.city}, ${subject.state} ${subject.zip}`,
    `Beds: ${subject.beds} | Baths: ${subject.baths} | Sqft: ${subject.sqft}`,
    `Lot: ${subject.lot_sqft} sqft | Year Built: ${subject.year_built}`,
    `Type: ${subject.property_type} | Condition: ${subject.condition}`,
    subject.pool ? 'Pool: Yes' : null,
    subject.garage ? `Garage: ${subject.garage_bays} bays` : null,
    subject.carport ? 'Carport: Yes' : null,
    subject.basement ? `Basement: ${subject.basement_sqft} sqft (valued at 50%)` : null,
    subject.guest_house ? `Guest House: ${subject.guest_house_sqft} sqft (valued at 50%)` : null,
    subject.traffic_exposure !== 'none' ? `Traffic/Commercial: ${subject.traffic_exposure}` : null,
    subject.asking_price ? `Asking Price: $${subject.asking_price.toLocaleString()}` : null,
  ].filter(Boolean).join('\n');

  const compsUsedLines = compsUsed.map((c, i) =>
    `${i + 1}. ${c.address} — Sale: $${c.sale_price.toLocaleString()} → Adjusted: $${c.adjusted_price.toLocaleString()} (${c.days_old}d old, ${c.sqft}sqft, ${c.distance_miles.toFixed(1)}mi)` +
    (c.adjustments.length ? `\n   Adjustments: ${c.adjustments.map(a => `${a.reason}: ${a.amount >= 0 ? '+' : ''}$${a.amount.toLocaleString()}`).join(', ')}` : '')
  ).join('\n');

  const dqLines = compsDisqualified.length > 0
    ? compsDisqualified.map((c, i) =>
        `${i + 1}. ${c.address} — $${c.sale_price.toLocaleString()} | Reasons: ${c.disqualified_reasons.join(', ')}`
      ).join('\n')
    : 'None';

  const rulesBlock = `- ${COMP_RULES.maxAge}-day max comp age (${COMP_RULES.agingThreshold}+ gets ${COMP_RULES.agingPenalty * 100}% penalty)
- +/- ${COMP_RULES.maxSqftDifference} sqft
- Same property type
- No major road crossings
- +/- ${COMP_RULES.maxYearBuiltDifference} year build date
- +/- ${COMP_RULES.maxLotSqftDifference.toLocaleString()} sqft lot size
- Same subdivision preferred
- Bedroom adj: $${(ADJUSTMENTS.bedroom.under200k / 1000)}K-$${(ADJUSTMENTS.bedroom.over400k / 1000)}K, Bathroom: $${(ADJUSTMENTS.bathroom / 1000)}K, Garage: $${(ADJUSTMENTS.garage / 1000)}K, Carport: $${(ADJUSTMENTS.carport / 1000)}K, Pool: $${(ADJUSTMENTS.pool / 1000)}K
- Under $500K traffic: siding -$${(ADJUSTMENTS.traffic.under500k.siding / 1000)}K, backing -$${(ADJUSTMENTS.traffic.under500k.backing / 1000)}K, fronting -$${(ADJUSTMENTS.traffic.under500k.fronting / 1000)}K
- Over $500K traffic: siding -${ADJUSTMENTS.traffic.over500k.siding * 100}%, backing -${ADJUSTMENTS.traffic.over500k.backing * 100}%, fronting -${ADJUSTMENTS.traffic.over500k.fronting * 100}%
- Basement/guest house at ${COMP_RULES.basementGuestHouseMultiplier * 100}% of $/sqft`;

  return `Review this analysis:

SUBJECT PROPERTY:
${subjectLines}

COMPS USED:
${compsUsedLines}

COMPS DISQUALIFIED:
${dqLines}

OUR RULES:
${rulesBlock}

CALCULATED NUMBERS:
ARV: $${arvResult.arv.toLocaleString()} (confidence: ${arvResult.confidence})
Repairs: $${repairEstimate.toLocaleString()} (${repairBreakdown})
MAO: $${maoResult.mao.toLocaleString()}
${maoResult.breakdown.asking_price ? `Asking: $${maoResult.breakdown.asking_price.toLocaleString()}` : 'Asking: Not provided'}
${maoResult.breakdown.spread != null ? `Spread: $${maoResult.breakdown.spread.toLocaleString()}` : 'Spread: N/A'}

EVALUATE:
1. Did we follow our own rules correctly? Flag any mistakes.
2. Are the selected comps truly the best available? Would you have chosen differently?
3. Are the adjustments reasonable? Any over/under-adjusted?
4. Is the repair estimate realistic for this property's age and condition?
5. Confidence check: do you agree with our ARV confidence rating? Why?
6. Market context: any area-specific factors we should consider?
7. Final verdict: GO, NEGOTIATE, or PASS — with specific reasoning.
8. If NEGOTIATE: what's the highest you'd go and why?

Be specific. Use numbers. No fluff.`;
}

export async function analyzeWithAI(dealData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = buildPrompt(dealData);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text;

  // Parse numbered points
  const points = [];
  const lines = rawText.split('\n');
  let currentPoint = null;

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*\*{0,2}(.+?)(?:\*{0,2})?$/);
    if (match) {
      if (currentPoint) points.push(currentPoint);
      currentPoint = { number: parseInt(match[1]), text: line.replace(/^\d+\.\s*/, '') };
    } else if (currentPoint && line.trim()) {
      currentPoint.text += '\n' + line;
    }
  }
  if (currentPoint) points.push(currentPoint);

  // If parsing didn't find numbered points, return raw text as single point
  if (points.length === 0) {
    points.push({ number: 1, text: rawText });
  }

  return {
    points,
    rawText,
    model: data.model,
    usage: data.usage,
  };
}
