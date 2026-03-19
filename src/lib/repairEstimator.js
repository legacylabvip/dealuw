// DealUW Repair Estimator — Three modes: AI photo analysis, algorithmic, manual
// Uses Claude Haiku vision for photo analysis via process.env.ANTHROPIC_API_KEY

const CATEGORIES = [
  'roof', 'kitchen', 'bathrooms', 'flooring', 'interior_paint',
  'exterior_paint', 'hvac', 'plumbing', 'electrical', 'foundation',
  'windows', 'landscaping', 'driveway', 'siding', 'deck_patio',
  'garage', 'other',
];

const CATEGORY_LABELS = {
  roof: 'Roof',
  kitchen: 'Kitchen',
  bathrooms: 'Bathrooms',
  flooring: 'Flooring',
  interior_paint: 'Interior Paint',
  exterior_paint: 'Exterior Paint',
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  foundation: 'Foundation',
  windows: 'Windows',
  landscaping: 'Landscaping',
  driveway: 'Driveway',
  siding: 'Siding',
  deck_patio: 'Deck/Patio',
  garage: 'Garage',
  other: 'Other',
};

// Category max budgets for algorithmic estimates (used as upper bounds)
const CATEGORY_MAXES = {
  roof: 20000,
  kitchen: 25000,
  bathrooms: 15000,
  flooring: 15000,
  interior_paint: 8000,
  exterior_paint: 8000,
  hvac: 12000,
  plumbing: 10000,
  electrical: 10000,
  foundation: 20000,
  windows: 12000,
  landscaping: 5000,
  driveway: 5000,
  siding: 12000,
  deck_patio: 8000,
  garage: 8000,
  other: 5000,
};

// ─── MODE 1: AI Photo Analysis ──────────────────────────────────────────────

export async function estimateFromPhotos(property, photoDataUrls) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const address = property.address || 'unknown address';
  const beds = property.beds ?? '?';
  const baths = property.baths ?? '?';
  const sqft = property.sqft ?? '?';
  const yearBuilt = property.year_built ?? '?';
  const condition = property.condition ?? 'unknown';
  const city = property.city ?? '';
  const state = property.state ?? '';

  const prompt = `You are a professional property rehab estimator. Analyze these photos of a property at ${address}. The home is ${beds}bd/${baths}ba, ${sqft}sqft, built in ${yearBuilt}, condition reported as ${condition}.

For each photo, identify visible repair needs. Then provide a complete repair estimate in this EXACT JSON format (no markdown, no code fences, just raw JSON):

{
  "overall_condition": "poor|fair|good|excellent",
  "confidence": "high|medium|low",
  "line_items": [
    {"category": "roof", "description": "Visible wear, likely 15+ years old", "estimate_low": 5000, "estimate_high": 12000, "recommended": 8000, "urgency": "high"},
    {"category": "kitchen", "description": "Dated cabinets and countertops", "estimate_low": 8000, "estimate_high": 20000, "recommended": 12000, "urgency": "medium"}
  ],
  "total_low": 0,
  "total_high": 0,
  "total_recommended": 0,
  "notes": "any overall observations"
}

Categories to evaluate: roof, kitchen, bathrooms, flooring, interior_paint, exterior_paint, hvac, plumbing, electrical, foundation, windows, landscaping, driveway, siding, deck_patio, garage, other.

Only include categories that need work. Be conservative but realistic. Base estimates on ${city}, ${state} market rates.`;

  // Build content array with images
  const content = [];

  for (let i = 0; i < photoDataUrls.length; i++) {
    const dataUrl = photoDataUrls[i];
    // Extract base64 and media type from data URL
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1],
          data: match[2],
        },
      });
    }
  }

  content.push({ type: 'text', text: prompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text;

  // Parse JSON from response (handle potential markdown fences)
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse AI repair estimate response');
    }
  }

  // Validate and normalize
  const lineItems = (result.line_items || []).map(item => ({
    category: item.category || 'other',
    description: item.description || '',
    estimate_low: Math.round(item.estimate_low || 0),
    estimate_high: Math.round(item.estimate_high || 0),
    recommended: Math.round(item.recommended || 0),
    urgency: item.urgency || 'medium',
  }));

  const totalLow = lineItems.reduce((s, i) => s + i.estimate_low, 0);
  const totalHigh = lineItems.reduce((s, i) => s + i.estimate_high, 0);
  const totalRecommended = lineItems.reduce((s, i) => s + i.recommended, 0);

  return {
    mode: 'ai_photo',
    overall_condition: result.overall_condition || condition,
    confidence: result.confidence || 'medium',
    line_items: lineItems,
    total_low: totalLow,
    total_high: totalHigh,
    total_recommended: totalRecommended,
    notes: result.notes || '',
    usage: data.usage,
    model: data.model,
  };
}

// ─── MODE 2: Algorithmic Estimate ───────────────────────────────────────────

export function algorithmicEstimate(property) {
  const sqft = property.sqft || 1500;
  const condition = (property.condition || 'fair').toLowerCase();
  const yearBuilt = property.year_built || 1990;
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearBuilt;

  // Base rates per sqft by condition
  const basePerSqft = {
    excellent: 0,
    good: 8,
    fair: 18,
    poor: 32,
  };

  let base = sqft * (basePerSqft[condition] || basePerSqft.fair);

  // Age multiplier
  let ageMultiplier = 1.0;
  if (age > 80) {
    ageMultiplier = 1.50;
  } else if (age > 60) {
    ageMultiplier = 1.35;
  } else if (age > 40) {
    ageMultiplier = 1.20;
  }

  base = Math.round(base * ageMultiplier);

  // Generate line items based on condition and age
  const lineItems = [];

  if (condition === 'poor' || condition === 'fair') {
    // Always include cosmetics
    lineItems.push(makeItem('interior_paint', sqft, condition, age));
    lineItems.push(makeItem('flooring', sqft, condition, age));
    lineItems.push(makeItem('kitchen', sqft, condition, age));
    lineItems.push(makeItem('bathrooms', sqft, condition, age, property.baths || 1));
  }

  if (condition === 'poor') {
    lineItems.push(makeItem('exterior_paint', sqft, condition, age));
    lineItems.push(makeItem('windows', sqft, condition, age));
    lineItems.push(makeItem('landscaping', sqft, condition, age));
  }

  if (condition === 'good') {
    lineItems.push(makeItem('interior_paint', sqft, condition, age));
    lineItems.push(makeItem('flooring', sqft, condition, age));
    lineItems.push(makeItem('landscaping', sqft, condition, age));
  }

  // Mechanicals based on age
  if (age > 40 || condition === 'poor') {
    lineItems.push(makeItem('roof', sqft, condition, age));
    lineItems.push(makeItem('hvac', sqft, condition, age));
    lineItems.push(makeItem('plumbing', sqft, condition, age));
    lineItems.push(makeItem('electrical', sqft, condition, age));
  } else if (age > 25) {
    lineItems.push(makeItem('hvac', sqft, condition, age));
  }

  // Foundation concerns for very old homes
  if (age > 60 || condition === 'poor') {
    lineItems.push(makeItem('foundation', sqft, condition, age));
  }

  // De-duplicate categories (take the first occurrence)
  const seen = new Set();
  const unique = lineItems.filter(item => {
    if (seen.has(item.category)) return false;
    seen.add(item.category);
    return true;
  });

  // Scale items so total approximates the base estimate
  const rawTotal = unique.reduce((s, i) => s + i.recommended, 0);
  const scale = rawTotal > 0 ? base / rawTotal : 1;

  const scaled = unique.map(item => ({
    ...item,
    estimate_low: Math.round(item.estimate_low * scale / 500) * 500,
    estimate_high: Math.round(item.estimate_high * scale / 500) * 500,
    recommended: Math.round(item.recommended * scale / 500) * 500,
  }));

  const totalLow = scaled.reduce((s, i) => s + i.estimate_low, 0);
  const totalHigh = scaled.reduce((s, i) => s + i.estimate_high, 0);
  const totalRecommended = scaled.reduce((s, i) => s + i.recommended, 0);

  // Determine confidence
  let confidence = 'medium';
  if (condition === 'excellent' || condition === 'good') confidence = 'medium';
  if (condition === 'fair') confidence = 'low';
  if (condition === 'poor') confidence = 'low';

  const ageNote = age > 40
    ? `Property is ${age} years old — ${ageMultiplier > 1 ? `${((ageMultiplier - 1) * 100).toFixed(0)}% age premium applied` : 'no age premium'} for likely mechanical needs.`
    : '';

  return {
    mode: 'algorithmic',
    overall_condition: condition,
    confidence,
    line_items: scaled,
    total_low: totalLow,
    total_high: totalHigh,
    total_recommended: totalRecommended,
    notes: `Algorithmic estimate based on ${sqft} sqft, "${condition}" condition, built ${yearBuilt} (${age} years old). ${ageNote} Upload photos for a more accurate AI-powered estimate.`,
  };
}

function makeItem(category, sqft, condition, age, multiplier = 1) {
  const max = CATEGORY_MAXES[category] || 10000;
  const conditionFactor = { excellent: 0, good: 0.25, fair: 0.5, poor: 0.8 }[condition] || 0.5;
  const ageFactor = age > 60 ? 0.3 : age > 40 ? 0.15 : 0;

  const factor = Math.min(conditionFactor + ageFactor, 1.0);
  const recommended = Math.round((max * factor * multiplier) / 500) * 500;
  const low = Math.round(recommended * 0.6 / 500) * 500;
  const high = Math.round(recommended * 1.5 / 500) * 500;

  let urgency = 'low';
  if (factor > 0.7) urgency = 'high';
  else if (factor > 0.4) urgency = 'medium';

  const descriptions = {
    roof: age > 40 ? `Likely original roof (${age}yr), probable replacement needed` : `Roof inspection recommended — ${condition} condition`,
    kitchen: condition === 'poor' ? 'Full kitchen remodel — cabinets, counters, appliances' : 'Kitchen update — countertops, backsplash, fixtures',
    bathrooms: condition === 'poor' ? `Full bathroom remodel x${multiplier}` : `Bathroom update x${multiplier} — fixtures, vanity, tile`,
    flooring: condition === 'poor' ? 'Full flooring replacement throughout' : 'Flooring refresh — carpet, LVP, or refinish hardwood',
    interior_paint: 'Full interior paint — walls, trim, ceilings',
    exterior_paint: 'Exterior paint or siding touch-up',
    hvac: age > 40 ? `HVAC system likely original (${age}yr) — replacement probable` : 'HVAC service and possible component replacement',
    plumbing: age > 40 ? `Plumbing likely original (${age}yr) — inspection and updates needed` : 'Minor plumbing repairs',
    electrical: age > 40 ? `Electrical panel and wiring may need update (${age}yr home)` : 'Electrical inspection and minor updates',
    foundation: age > 60 ? 'Foundation inspection critical — potential settling/cracking' : 'Foundation inspection recommended',
    windows: condition === 'poor' ? 'Window replacement throughout' : 'Window repair/replacement as needed',
    landscaping: 'Yard cleanup, grading, basic landscaping',
    driveway: 'Driveway repair or reseal',
    siding: 'Siding repair or replacement',
    deck_patio: 'Deck/patio repair or rebuild',
    garage: 'Garage door and interior finish',
    other: 'Miscellaneous repairs',
  };

  return {
    category,
    description: descriptions[category] || `${CATEGORY_LABELS[category]} — ${condition} condition`,
    estimate_low: low,
    estimate_high: high,
    recommended,
    urgency,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { CATEGORIES, CATEGORY_LABELS, CATEGORY_MAXES };
