import { NextRequest, NextResponse } from 'next/server';
import { researchProperty } from '@/lib/webSearch';

export const maxDuration = 60; // Web search can take 15-60s

export async function POST(req: NextRequest) {
  try {
    const { address, city, state, zip } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    console.log('[DealUW] Property lookup request:', { address, city, state, zip });
    let parsed: unknown;
    try {
      parsed = await researchProperty(address, city || '', state || '', zip || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DealUW] researchProperty threw:', msg);
      return NextResponse.json({
        available: false, error: msg, fallback: 'manual', debug: 'research_threw',
      });
    }
    console.log('[DealUW] Property lookup result:', parsed ? 'got data' : 'null/undefined', typeof parsed);

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({
        available: false,
        error: 'lookup_failed',
        fallback: 'manual',
        debug_parsed: String(parsed),
        debug_type: typeof parsed,
      });
    }

    const p = parsed as Record<string, unknown>;
    const property = {
      address: (p.address as string) || address,
      city: (p.city as string) || city,
      state: (p.state as string) || state,
      zip: (p.zip as string) || zip,
      beds: toNum(p.beds),
      baths: toNum(p.baths),
      sqft: toNum(p.sqft),
      lot_sqft: toNum(p.lot_sqft) ?? toNum(p.lotSqft) ?? toNum(p.lot_size),
      year_built: toNum(p.year_built) ?? toNum(p.yearBuilt),
      property_type: (p.property_type as string) || (p.propertyType as string) || 'ranch',
      stories: toNum(p.stories),
      has_pool: toBool(p.has_pool) || toBool(p.hasPool),
      has_garage: toBool(p.has_garage) || toBool(p.hasGarage),
      garage_count: toNum(p.garage_count) ?? toNum(p.garageCount) ?? 0,
      has_carport: toBool(p.has_carport) || toBool(p.hasCarport),
      has_basement: toBool(p.has_basement) || toBool(p.hasBasement),
      basement_sqft: toNum(p.basement_sqft) ?? toNum(p.basementSqft) ?? 0,
      has_guest_house: toBool(p.has_guest_house) || toBool(p.hasGuestHouse),
      guest_house_sqft: toNum(p.guest_house_sqft) ?? toNum(p.guestHouseSqft) ?? 0,
      tax_assessed_value: toNum(p.tax_assessed_value) ?? toNum(p.taxAssessedValue),
      last_sale_price: toNum(p.last_sale_price) ?? toNum(p.lastSalePrice),
      last_sale_date: (p.last_sale_date as string) ?? (p.lastSaleDate as string) ?? null,
      subdivision: (p.subdivision as string) || null,
      zestimate: toNum(p.zestimate),
      estimated_rent: toNum(p.estimated_rent) ?? toNum(p.estimatedRent),
    };

    return NextResponse.json({ available: true, property, source: 'web_search' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Property lookup failed';
    console.error('[DealUW] Property lookup error:', message);
    return NextResponse.json({ available: false, error: message, fallback: 'manual' });
  }
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return !!v;
}
