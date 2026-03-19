// DealUW Property Lookup — Auto-pull property data and comps from RE data APIs
// Supports multiple providers via RE_DATA_PROVIDER env variable.

import { COMP_RULES } from './compRules.js';

// ─── Haversine distance (miles) ─────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Provider: RealEstateAPI.com ────────────────────────────────────────────

const realEstateApi = {
  name: 'realestate_api',

  async lookupProperty(address, city, state, zip) {
    const apiKey = process.env.RE_API_KEY;
    if (!apiKey) throw new Error('RE_API_KEY not configured');

    const params = new URLSearchParams({
      address,
      city,
      state,
      zip,
    });

    const res = await fetch(`https://api.realestateapi.com/v2/PropertyDetail?${params}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`RealEstateAPI property lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const p = data.data || data;

    return {
      address: p.address?.full || address,
      city: p.address?.city || city,
      state: p.address?.state || state,
      zip: p.address?.zip || zip,
      beds: p.bedrooms ?? null,
      baths: p.bathrooms ?? null,
      sqft: p.squareFootage ?? p.livingArea ?? null,
      lot_sqft: p.lotSquareFootage ?? p.lotSize ?? null,
      year_built: p.yearBuilt ?? null,
      property_type: normalizePropertyType(p.propertyType || p.propertySubType || ''),
      stories: p.stories ?? null,
      has_pool: !!p.pool || !!p.hasPool,
      has_garage: !!p.garage || (p.garageSpaces ?? 0) > 0,
      garage_count: p.garageSpaces ?? (p.garage ? 1 : 0),
      has_carport: !!p.carport,
      has_basement: !!p.basement || p.basementType === 'finished' || p.basementType === 'unfinished',
      basement_sqft: p.basementSquareFootage ?? 0,
      has_guest_house: !!p.guestHouse,
      guest_house_sqft: p.guestHouseSquareFootage ?? 0,
      tax_assessed_value: p.taxAssessedValue ?? p.assessedValue ?? null,
      last_sale_price: p.lastSalePrice ?? null,
      last_sale_date: p.lastSaleDate ?? null,
      zoning: p.zoning ?? null,
      subdivision: p.subdivision ?? p.neighborhoodName ?? null,
      latitude: p.latitude ?? p.location?.latitude ?? null,
      longitude: p.longitude ?? p.location?.longitude ?? null,
      raw_data: data,
    };
  },

  async pullComps(property, options = {}) {
    const apiKey = process.env.RE_API_KEY;
    if (!apiKey) throw new Error('RE_API_KEY not configured');

    const radius = options.radius || 0.5;
    const maxAge = options.maxAge || COMP_RULES.maxAge;

    const params = new URLSearchParams({
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      radius: String(radius),
      daysBack: String(maxAge),
    });

    // Add filtering params if property data available
    if (property.sqft) {
      params.set('minSquareFootage', String(property.sqft - (options.sqftRange || COMP_RULES.maxSqftDifference)));
      params.set('maxSquareFootage', String(property.sqft + (options.sqftRange || COMP_RULES.maxSqftDifference)));
    }
    if (property.year_built) {
      params.set('minYearBuilt', String(property.year_built - COMP_RULES.maxYearBuiltDifference));
      params.set('maxYearBuilt', String(property.year_built + COMP_RULES.maxYearBuiltDifference));
    }

    const res = await fetch(`https://api.realestateapi.com/v2/PropertyComps?${params}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`RealEstateAPI comps lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const comps = data.data || data.comps || data.comparables || [];
    if (!Array.isArray(comps)) return [];

    return comps.map(c => normalizeComp(c, property));
  },
};

// ─── Provider: ATTOM Data ───────────────────────────────────────────────────

const attomApi = {
  name: 'attom',

  async lookupProperty(address, city, state, zip) {
    const apiKey = process.env.ATTOM_API_KEY;
    if (!apiKey) throw new Error('ATTOM_API_KEY not configured');

    const params = new URLSearchParams({
      address1: address,
      address2: `${city}, ${state} ${zip}`,
    });

    const res = await fetch(`https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?${params}`, {
      headers: { apikey: apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ATTOM property lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const p = data.property?.[0] || {};
    const building = p.building || {};
    const lot = p.lot || {};
    const location = p.location || {};
    const summary = building.summary || {};
    const rooms = building.rooms || {};

    return {
      address: p.address?.oneLine || address,
      city: p.address?.locality || city,
      state: p.address?.countrySubd || state,
      zip: p.address?.postal1 || zip,
      beds: rooms.beds ?? null,
      baths: rooms.bathsFull ?? null,
      sqft: summary.livingSize ?? building.size?.livingSize ?? null,
      lot_sqft: lot.lotSize1 ?? lot.lotSize2 ?? null,
      year_built: summary.yearBuilt ?? null,
      property_type: normalizePropertyType(summary.propertyType || ''),
      stories: summary.stories ?? null,
      has_pool: !!building.construction?.pool,
      has_garage: (building.parking?.garageType ?? '') !== '',
      garage_count: building.parking?.garageSpaces ?? 0,
      has_carport: (building.parking?.carportType ?? '') !== '',
      has_basement: (building.interior?.bsmtType ?? '') !== '',
      basement_sqft: building.interior?.bsmtSize ?? 0,
      has_guest_house: false,
      guest_house_sqft: 0,
      tax_assessed_value: p.assessment?.assessed?.assdTtlValue ?? null,
      last_sale_price: p.sale?.amount?.saleAmt ?? null,
      last_sale_date: p.sale?.amount?.saleRecDate ?? null,
      zoning: lot.zoning ?? null,
      subdivision: location.subdivision ?? null,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      raw_data: data,
    };
  },

  async pullComps(property, options = {}) {
    const apiKey = process.env.ATTOM_API_KEY;
    if (!apiKey) throw new Error('ATTOM_API_KEY not configured');

    const radius = options.radius || 0.5;
    const maxAge = options.maxAge || COMP_RULES.maxAge;

    const params = new URLSearchParams({
      address1: property.address,
      address2: `${property.city}, ${property.state} ${property.zip}`,
      searchType: 'Radius',
      minComps: '3',
      maxComps: '15',
      miles: String(radius),
      saleDateStart: daysAgoISO(maxAge),
    });

    if (property.sqft) {
      params.set('sqFeetRange', String(options.sqftRange || COMP_RULES.maxSqftDifference));
    }

    const res = await fetch(`https://api.gateway.attomdata.com/propertyapi/v1.0.0/salescomparables/detail?${params}`, {
      headers: { apikey: apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ATTOM comps lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const comps = data.property || [];
    if (!Array.isArray(comps)) return [];

    return comps.map(c => {
      const sale = c.sale || {};
      const building = c.building || {};
      const lot = c.lot || {};
      const location = c.location || {};
      const summary = building.summary || {};
      const rooms = building.rooms || {};

      return normalizeComp({
        address: c.address?.oneLine || '',
        sale_price: sale.amount?.saleAmt ?? 0,
        sale_date: sale.amount?.saleRecDate ?? '',
        sqft: summary.livingSize ?? building.size?.livingSize ?? 0,
        lot_sqft: lot.lotSize1 ?? 0,
        beds: rooms.beds ?? 0,
        baths: rooms.bathsFull ?? 0,
        year_built: summary.yearBuilt ?? 0,
        property_type: summary.propertyType || '',
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        subdivision: location.subdivision ?? null,
        has_pool: !!building.construction?.pool,
        has_garage: (building.parking?.garageType ?? '') !== '',
        garage_count: building.parking?.garageSpaces ?? 0,
        has_carport: (building.parking?.carportType ?? '') !== '',
        has_basement: (building.interior?.bsmtType ?? '') !== '',
        basement_sqft: building.interior?.bsmtSize ?? 0,
      }, property);
    });
  },
};

// ─── Provider: PropStream ───────────────────────────────────────────────────

const propStreamApi = {
  name: 'propstream',

  async lookupProperty(address, city, state, zip) {
    const apiKey = process.env.PROPSTREAM_API_KEY;
    if (!apiKey) throw new Error('PROPSTREAM_API_KEY not configured');

    const res = await fetch('https://api.propstream.com/v1/property/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ address, city, state, zip }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PropStream property lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const p = data.results?.[0] || data.property || data;

    return {
      address: p.address || address,
      city: p.city || city,
      state: p.state || state,
      zip: p.zip || zip,
      beds: p.beds ?? p.bedrooms ?? null,
      baths: p.baths ?? p.bathrooms ?? null,
      sqft: p.sqft ?? p.squareFootage ?? null,
      lot_sqft: p.lotSqft ?? p.lotSquareFootage ?? null,
      year_built: p.yearBuilt ?? null,
      property_type: normalizePropertyType(p.propertyType || ''),
      stories: p.stories ?? null,
      has_pool: !!p.pool,
      has_garage: !!p.garage || (p.garageSpaces ?? 0) > 0,
      garage_count: p.garageSpaces ?? 0,
      has_carport: !!p.carport,
      has_basement: !!p.basement,
      basement_sqft: p.basementSqft ?? 0,
      has_guest_house: !!p.guestHouse,
      guest_house_sqft: p.guestHouseSqft ?? 0,
      tax_assessed_value: p.assessedValue ?? null,
      last_sale_price: p.lastSalePrice ?? null,
      last_sale_date: p.lastSaleDate ?? null,
      zoning: p.zoning ?? null,
      subdivision: p.subdivision ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      raw_data: data,
    };
  },

  async pullComps(property, options = {}) {
    const apiKey = process.env.PROPSTREAM_API_KEY;
    if (!apiKey) throw new Error('PROPSTREAM_API_KEY not configured');

    const radius = options.radius || 0.5;
    const maxAge = options.maxAge || COMP_RULES.maxAge;

    const res = await fetch('https://api.propstream.com/v1/comps/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        radius,
        daysBack: maxAge,
        minSqft: property.sqft ? property.sqft - (options.sqftRange || COMP_RULES.maxSqftDifference) : undefined,
        maxSqft: property.sqft ? property.sqft + (options.sqftRange || COMP_RULES.maxSqftDifference) : undefined,
        limit: 15,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PropStream comps lookup failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const comps = data.results || data.comps || [];
    if (!Array.isArray(comps)) return [];

    return comps.map(c => normalizeComp({
      address: c.address || '',
      sale_price: c.salePrice ?? c.sale_price ?? 0,
      sale_date: c.saleDate ?? c.sale_date ?? '',
      sqft: c.sqft ?? c.squareFootage ?? 0,
      lot_sqft: c.lotSqft ?? c.lotSquareFootage ?? 0,
      beds: c.beds ?? c.bedrooms ?? 0,
      baths: c.baths ?? c.bathrooms ?? 0,
      year_built: c.yearBuilt ?? c.year_built ?? 0,
      property_type: c.propertyType ?? c.property_type ?? '',
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
      subdivision: c.subdivision ?? null,
      has_pool: !!c.pool,
      has_garage: !!c.garage || (c.garageSpaces ?? 0) > 0,
      garage_count: c.garageSpaces ?? 0,
      has_carport: !!c.carport,
      has_basement: !!c.basement,
      basement_sqft: c.basementSqft ?? 0,
    }, property));
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function daysBetween(dateStr) {
  const sale = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - sale.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizePropertyType(raw) {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('ranch') || lower.includes('rambler') || lower.includes('single story')) return 'ranch';
  if (lower.includes('2-story') || lower.includes('two story') || lower.includes('2 story') || lower.includes('colonial')) return '2-story';
  if (lower.includes('split')) return 'split-level';
  if (lower.includes('historic') || lower.includes('victorian') || lower.includes('craftsman')) return 'historic';
  if (lower.includes('condo')) return 'condo';
  if (lower.includes('townhouse') || lower.includes('townhome') || lower.includes('attached')) return 'townhouse';
  if (lower.includes('multi') || lower.includes('duplex') || lower.includes('triplex')) return 'multi-family';
  if (lower.includes('single') || lower.includes('sfr') || lower.includes('residential')) return 'ranch'; // default SFR
  return lower || 'ranch';
}

function normalizeComp(rawComp, subjectProperty) {
  const saleDate = rawComp.sale_date || rawComp.saleDate || '';
  const daysOld = saleDate ? daysBetween(saleDate) : 0;
  const sqft = rawComp.sqft || rawComp.squareFootage || 0;
  const salePrice = rawComp.sale_price || rawComp.salePrice || 0;

  // Calculate distance from subject using lat/long
  let distanceMiles = rawComp.distance_miles ?? rawComp.distance ?? null;
  if (distanceMiles == null && subjectProperty.latitude && subjectProperty.longitude && rawComp.latitude && rawComp.longitude) {
    distanceMiles = haversineDistance(
      subjectProperty.latitude, subjectProperty.longitude,
      rawComp.latitude, rawComp.longitude
    );
    distanceMiles = Math.round(distanceMiles * 100) / 100;
  }

  // Check same subdivision
  let sameSubdivision = rawComp.same_subdivision ?? rawComp.sameSubdivision ?? null;
  if (sameSubdivision == null && subjectProperty.subdivision && rawComp.subdivision) {
    sameSubdivision = subjectProperty.subdivision.toLowerCase() === rawComp.subdivision.toLowerCase();
  }

  return {
    address: rawComp.address || '',
    sale_price: salePrice,
    sale_date: saleDate,
    days_old: daysOld,
    sqft,
    lot_sqft: rawComp.lot_sqft || rawComp.lotSqft || rawComp.lotSquareFootage || 0,
    beds: rawComp.beds || rawComp.bedrooms || 0,
    baths: rawComp.baths || rawComp.bathrooms || 0,
    year_built: rawComp.year_built || rawComp.yearBuilt || 0,
    property_type: normalizePropertyType(rawComp.property_type || rawComp.propertyType || ''),
    distance_miles: distanceMiles ?? 0,
    same_subdivision: sameSubdivision ?? false,
    crosses_major_road: false, // Can't auto-detect — user must override
    has_pool: !!rawComp.has_pool || !!rawComp.pool,
    has_garage: !!rawComp.has_garage || !!rawComp.garage || (rawComp.garage_count ?? rawComp.garageSpaces ?? 0) > 0,
    garage_count: rawComp.garage_count ?? rawComp.garageSpaces ?? 0,
    has_carport: !!rawComp.has_carport || !!rawComp.carport,
    has_basement: !!rawComp.has_basement || !!rawComp.basement,
    basement_sqft: rawComp.basement_sqft ?? rawComp.basementSqft ?? 0,
    has_guest_house: !!rawComp.has_guest_house || !!rawComp.guestHouse,
    guest_house_sqft: rawComp.guest_house_sqft ?? rawComp.guestHouseSqft ?? 0,
    subdivision: rawComp.subdivision ?? null,
    latitude: rawComp.latitude ?? null,
    longitude: rawComp.longitude ?? null,
    price_per_sqft: sqft > 0 ? Math.round((salePrice / sqft) * 100) / 100 : 0,
  };
}

// ─── Provider registry ──────────────────────────────────────────────────────

const PROVIDERS = {
  realestate_api: realEstateApi,
  attom: attomApi,
  propstream: propStreamApi,
};

function getProvider() {
  const name = process.env.RE_DATA_PROVIDER || 'realestate_api';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown RE data provider: ${name}. Options: ${Object.keys(PROVIDERS).join(', ')}`);
  return provider;
}

function getAvailableProvider() {
  // Try configured provider first
  const configured = process.env.RE_DATA_PROVIDER;
  if (configured && PROVIDERS[configured]) {
    const keyMap = { realestate_api: 'RE_API_KEY', attom: 'ATTOM_API_KEY', propstream: 'PROPSTREAM_API_KEY' };
    if (process.env[keyMap[configured]]) return PROVIDERS[configured];
  }
  // Auto-detect from available API keys
  if (process.env.RE_API_KEY) return PROVIDERS.realestate_api;
  if (process.env.ATTOM_API_KEY) return PROVIDERS.attom;
  if (process.env.PROPSTREAM_API_KEY) return PROVIDERS.propstream;
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function isAutoLookupAvailable() {
  return getAvailableProvider() !== null;
}

export function getProviderName() {
  const provider = getAvailableProvider();
  return provider ? provider.name : null;
}

export async function lookupProperty(address, city, state, zip) {
  const provider = getAvailableProvider();
  if (!provider) {
    return { available: false, error: 'No RE data API key configured. Enter details manually.' };
  }

  try {
    const data = await provider.lookupProperty(address, city, state, zip);
    return { available: true, property: data };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

export async function pullComps(property, options = {}) {
  const provider = getAvailableProvider();
  if (!provider) {
    return { available: false, comps: [], expansions: [], error: 'No RE data API key configured. Add comps manually.' };
  }

  const expansions = [];
  const radiusSteps = [0.25, 0.5, 1.0];
  let allComps = [];

  for (const radius of radiusSteps) {
    try {
      const opts = { ...options, radius };
      allComps = await provider.pullComps(property, opts);

      if (radius > radiusSteps[0]) {
        expansions.push(`Expanded radius to ${radius} mi to find more comps`);
      }

      if (allComps.length >= 3) break;
    } catch (err) {
      expansions.push(`API error at ${radius}mi radius: ${err.message}`);
    }
  }

  // If still < 3 comps, try expanding sqft range
  if (allComps.length < 3 && allComps.length > 0) {
    try {
      const expandedOpts = { ...options, radius: 1.0, sqftRange: 400 };
      const expanded = await provider.pullComps(property, expandedOpts);
      if (expanded.length > allComps.length) {
        allComps = expanded;
        expansions.push('Expanded sqft range to +/- 400 sqft');
      }
    } catch { /* keep what we have */ }
  }

  // Sort: same subdivision first, then distance, then recency
  allComps.sort((a, b) => {
    if (a.same_subdivision && !b.same_subdivision) return -1;
    if (!a.same_subdivision && b.same_subdivision) return 1;
    const distDiff = (a.distance_miles || 999) - (b.distance_miles || 999);
    if (distDiff !== 0) return distDiff;
    return (a.days_old || 999) - (b.days_old || 999);
  });

  // Limit to 15
  allComps = allComps.slice(0, 15);

  const lowConfidence = allComps.length < 3;
  if (lowConfidence) {
    expansions.push(`Only ${allComps.length} comp(s) found — LOW confidence`);
  }

  return {
    available: true,
    comps: allComps,
    expansions,
    low_confidence: lowConfidence,
    provider: provider.name,
  };
}
