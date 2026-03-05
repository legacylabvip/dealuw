// DealUW Zoria Lookup — Routes data lookups through Zoria's Mission Control API.
// Zoria delegates to Recon who searches the web for property data and comps.

const ZORIA_API = process.env.ZORIA_API_URL || 'http://localhost:3100/api/zoria';
const ZORIA_KEY = process.env.ZORIA_API_KEY || 'house-of-iverson-2026';

// ─── Response Parsing ────────────────────────────────────────────────────────
// Zoria may wrap JSON in explanation text — we need to extract it robustly.

function extractJSON(raw) {
  if (!raw) return null;

  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // 1. Direct parse
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* continue */ }

  // 2. Strip markdown fences
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    try {
      return JSON.parse(cleaned);
    } catch { /* continue */ }
  }

  // 3. Find JSON array [ ... ]
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch { /* continue */ }
  }

  // 4. Find JSON object { ... }
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch { /* continue */ }
  }

  return null;
}

function extractFromZoriaResponse(response) {
  // Zoria returns various shapes — normalize
  if (!response) return null;

  // If response is already parsed JSON with a data/result field
  if (response.result) return extractJSON(response.result);
  if (response.data) return extractJSON(response.data);
  if (response.response) return extractJSON(response.response);
  if (response.message) return extractJSON(response.message);
  if (response.content) return extractJSON(response.content);
  if (response.text) return extractJSON(response.text);

  // Try the entire response
  return extractJSON(response);
}

// ─── Property Lookup ─────────────────────────────────────────────────────────

export async function lookupProperty(address, city, state, zip) {
  const response = await fetch(ZORIA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zoria-key': ZORIA_KEY,
    },
    body: JSON.stringify({
      action: 'research_property',
      data: {
        address,
        city,
        state,
        zip,
        instructions: `Research this property and return data in EXACT JSON format.
Search Zillow, Realtor.com, Redfin, and county tax records for:

{
  "address": "${address}",
  "city": "${city}",
  "state": "${state}",
  "zip": "${zip}",
  "beds": number,
  "baths": number,
  "sqft": number,
  "lot_sqft": number,
  "year_built": number,
  "property_type": "ranch|2-story|split-level|historic|condo|townhouse|multi-family",
  "stories": number,
  "has_pool": boolean,
  "has_garage": boolean,
  "garage_count": number,
  "has_basement": boolean,
  "basement_sqft": number,
  "has_carport": boolean,
  "has_guest_house": boolean,
  "guest_house_sqft": number,
  "tax_assessed_value": number,
  "last_sale_price": number,
  "last_sale_date": "YYYY-MM-DD",
  "subdivision": "name or unknown",
  "zestimate": number or null,
  "estimated_rent": number or null
}

Return ONLY the JSON. No commentary.`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoria API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function lookupComps(address, city, state, zip, subject) {
  const sqft = subject.sqft || 1500;
  const yearBuilt = subject.year_built || 2000;
  const lotSqft = subject.lot_sqft || 7000;

  const response = await fetch(ZORIA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zoria-key': ZORIA_KEY,
    },
    body: JSON.stringify({
      action: 'research_comps',
      data: {
        address,
        city,
        state,
        zip,
        subject_details: subject,
        instructions: `Find 5-10 comparable home sales near ${address}, ${city}, ${state} ${zip}.

SEARCH CRITERIA (these are strict appraisal rules):
- Sold within the last 180 days
- Within 1 mile radius
- Similar sqft: ${sqft} +/- 250 sqft (so ${sqft - 250} to ${sqft + 250})
- Same property type: ${subject.property_type || 'ranch'}
- Built within +/- 10 years of ${yearBuilt} (so ${yearBuilt - 10} to ${yearBuilt + 10})
- Similar lot size: ${lotSqft} +/- 2,500 sqft

Search Zillow recently sold, Redfin sold, Realtor.com sold listings,
and county records.

Return EACH comp in this EXACT JSON array format:
[
  {
    "address": "full street address",
    "sale_price": number,
    "sale_date": "YYYY-MM-DD",
    "sqft": number,
    "lot_sqft": number,
    "beds": number,
    "baths": number,
    "year_built": number,
    "property_type": "ranch|2-story|etc",
    "distance_miles": estimated distance from subject,
    "same_subdivision": boolean,
    "has_pool": boolean,
    "has_garage": boolean,
    "garage_count": number,
    "has_basement": boolean,
    "basement_sqft": number,
    "source": "zillow|redfin|realtor|county"
  }
]

Return ONLY the JSON array. No commentary. If you can't find enough
comps within strict criteria, expand the search radius but note the
distance. Always return at least 3 comps if possible.`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoria API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function analyzePhotos(photos, property) {
  const address = property.address || 'unknown';
  const beds = property.beds ?? '?';
  const baths = property.baths ?? '?';
  const sqft = property.sqft ?? '?';
  const yearBuilt = property.year_built ?? '?';
  const condition = property.condition ?? 'unknown';
  const city = property.city ?? '';
  const state = property.state ?? '';

  const response = await fetch(ZORIA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zoria-key': ZORIA_KEY,
    },
    body: JSON.stringify({
      action: 'analyze_photos',
      data: {
        photos,
        property,
        instructions: `You are a property rehab estimator. Analyze these photos of ${address}. The home is ${beds}bd/${baths}ba, ${sqft}sqft, built ${yearBuilt}, condition: ${condition}.

Return a repair estimate in this EXACT JSON format:
{
  "overall_condition": "poor|fair|good|excellent",
  "confidence": "high|medium|low",
  "line_items": [
    {"category": "roof", "description": "what you see", "estimate_low": number, "estimate_high": number, "recommended": number, "urgency": "high|medium|low"},
    {"category": "kitchen", "description": "what you see", "estimate_low": number, "estimate_high": number, "recommended": number, "urgency": "medium"}
  ],
  "total_low": number,
  "total_high": number,
  "total_recommended": number,
  "notes": "overall observations"
}

Categories: roof, kitchen, bathrooms, flooring, interior_paint, exterior_paint, hvac, plumbing, electrical, foundation, windows, landscaping, driveway, siding, deck_patio, garage, other.
Only include categories that need work. Base costs on ${city}, ${state} market.
Return ONLY JSON.`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoria API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { extractJSON, extractFromZoriaResponse };
