// DealUW Web Search — Direct Anthropic API with web search for property/comp research
// Replaces the Zoria/Mission Control dependency for production deployment

let _lastCallDebug = { text: '', status: 0 };
export function debugLastCall() { return _lastCallDebug; }

function extractJSON(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* continue */ }

  // Strip markdown fences
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    try { return JSON.parse(cleaned); } catch { /* continue */ }
  }

  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* continue */ } }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* continue */ } }

  return null;
}

async function callAnthropicWebSearch(prompt: string): Promise<{ text: string; parsed: unknown }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  console.log('[DealUW] API key present, length:', apiKey.length, 'starts with:', apiKey.substring(0, 10));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
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
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[DealUW] Anthropic API error:', response.status, errorBody);
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    const aiResponse = await response.json() as {
      content: { type: string; text?: string }[];
    };

    console.log('[DealUW] Anthropic response blocks:', aiResponse.content?.map((b: { type: string }) => b.type));

    const textContent = aiResponse.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text?: string }) => block.text ?? '')
      .join('\n');

    console.log('[DealUW] Extracted text length:', textContent.length, 'preview:', textContent.substring(0, 200));
    _lastCallDebug = { text: textContent, status: response.status };
    const parsed = extractJSON(textContent);
    console.log('[DealUW] Parsed result:', parsed ? 'success' : 'null');
    return { text: textContent, parsed };
  } finally {
    clearTimeout(timeout);
  }
}

export async function researchProperty(address: string, city: string, state: string, zip: string) {
  const prompt = `Search for property details for ${address}, ${city}, ${state} ${zip}.

Look up this property on Zillow, Realtor.com, Redfin, or county tax records.
Find: bedrooms, bathrooms, square footage, lot size, year built, property type,
whether it has a pool, garage, basement, the tax assessed value, last sale
price and date, subdivision name, and estimated monthly rent.

Return ONLY a JSON object in this exact format, no other text:
{
  "beds": number,
  "baths": number,
  "sqft": number,
  "lot_sqft": number,
  "year_built": number,
  "property_type": "ranch or 2-story or split-level or historic or condo or townhouse or multi",
  "has_pool": true/false,
  "has_garage": true/false,
  "garage_count": number,
  "has_basement": true/false,
  "basement_sqft": number or 0,
  "tax_assessed_value": number,
  "last_sale_price": number or null,
  "last_sale_date": "YYYY-MM-DD" or null,
  "subdivision": "name or unknown",
  "estimated_rent": number or null,
  "zestimate": number or null
}`;

  const { text, parsed } = await callAnthropicWebSearch(prompt);
  if (!parsed) {
    console.error('[DealUW] researchProperty: failed to parse. Raw text:', text.substring(0, 500));
  }
  return parsed;
}

export async function researchComps(
  address: string, city: string, state: string, zip: string,
  subject: Record<string, unknown>
) {
  const sqft = Number(subject.sqft) || 2000;
  const propertyType = subject.property_type ?? 'single family';
  const yearBuilt = subject.year_built ?? 'unknown';
  const lotSqft = subject.lot_sqft ?? 6000;
  const sqftLow = Math.round(sqft * 0.85);
  const sqftHigh = Math.round(sqft * 1.15);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  const compsJsonFormat = `[
  {
    "address": "street address",
    "sale_price": dollar amount as number,
    "sale_date": "YYYY-MM-DD",
    "sqft": number,
    "lot_sqft": number or ${lotSqft},
    "beds": number,
    "baths": number,
    "year_built": number,
    "property_type": "type",
    "distance_miles": estimated distance as number,
    "same_subdivision": true or false,
    "has_pool": false,
    "has_garage": true or false,
    "source": "zillow or redfin"
  }
]`;

  const prompt = `Search for recently sold homes near ${address}, ${city}, ${state} ${zip}.

I need comparable sales for a property that is ${sqft} sqft, ${propertyType} style, built in ${yearBuilt}, on a ${lotSqft} sqft lot.

Search Zillow for "recently sold homes ${city} ${state} ${zip}" and Redfin for "sold homes near ${address} ${city} ${state}".

Find 5-10 homes that:
- Sold in the last 6 months (since ${sixMonthsAgo})
- Are within 1 mile of the subject
- Are between ${sqftLow} and ${sqftHigh} sqft
- Are a similar style home

For EACH home you find, return this data. Return ONLY a JSON array:
${compsJsonFormat}

If you cannot find exact matches, broaden your search to the full ${zip} zip code. Return whatever sold homes you CAN find — some data is better than none. Do NOT return an empty array unless you truly found nothing.`;

  console.log('[DealUW] Searching for comps:', address, city, state, zip);
  const { text, parsed } = await callAnthropicWebSearch(prompt);
  console.log('[DealUW] Primary search result:', parsed ? `${Array.isArray(parsed) ? parsed.length : 'object'} items` : 'null', 'raw length:', text.length);

  if (Array.isArray(parsed) && parsed.length > 0) return parsed;

  // If parsed is an object with comps inside
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const arr = obj.comps || obj.results || obj.comparables || obj.sales || obj.data;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }

  // Fallback: broader search
  const fallbackPrompt = `Search for recently sold homes in zip code ${zip || 'near ' + city + ' ' + state}.

Search Zillow for "recently sold homes ${zip || city + ' ' + state}" and Redfin for "sold homes ${zip || city + ' ' + state}".

I need homes that sold in the last 12 months. Any size, any style, any age.

Find as many as you can, up to 10. Return ONLY a JSON array:
${compsJsonFormat}

Return whatever sold homes you CAN find. Some data is better than none. Do NOT return an empty array.`;

  console.log('[DealUW] Running fallback comp search');
  const fallback = await callAnthropicWebSearch(fallbackPrompt);
  console.log('[DealUW] Fallback result:', fallback.parsed ? `${Array.isArray(fallback.parsed) ? fallback.parsed.length : 'object'} items` : 'null');

  if (Array.isArray(fallback.parsed) && fallback.parsed.length > 0) return fallback.parsed;

  // Try to extract from fallback object
  if (fallback.parsed && typeof fallback.parsed === 'object' && !Array.isArray(fallback.parsed)) {
    const obj = fallback.parsed as Record<string, unknown>;
    const arr = obj.comps || obj.results || obj.comparables || obj.sales || obj.data;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }

  return parsed;
}
