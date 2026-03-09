import { NextRequest, NextResponse } from 'next/server';
import { researchComps } from '@/lib/webSearch';
import { filterComps } from '@/lib/compEngine';

export const maxDuration = 60; // Web search can take 15-60s

export async function POST(req: NextRequest) {
  try {
    const { address, city, state, zip, subject_details } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const subject = subject_details || {};

    const parsed = await researchComps(address, city || '', state || '', zip || '', subject);

    // Handle various response shapes
    let compsArray: Record<string, unknown>[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      compsArray = parsed as Record<string, unknown>[];
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const inner = (obj.comps || obj.results || obj.comparables || obj.sales || obj.data) as unknown[];
      if (Array.isArray(inner) && inner.length > 0) {
        compsArray = inner as Record<string, unknown>[];
      } else {
        return NextResponse.json({
          available: false, error: 'no_comps_found', fallback: 'manual',
          qualified: [], disqualified: [], raw_count: 0,
        });
      }
    } else {
      return NextResponse.json({
        available: false, error: 'lookup_failed', fallback: 'manual',
        qualified: [], disqualified: [], raw_count: 0,
      });
    }

    const rawComps = compsArray.map(normalizeComp);
    const filtered = filterComps(subject, rawComps);

    // Ensure at least 3 qualified comps — promote disqualified if needed
    let qualified = filtered.qualified;
    let disqualified = filtered.disqualified;
    if (qualified.length < 3 && disqualified.length > 0) {
      const needed = 3 - qualified.length;
      const promoted = disqualified.slice(0, needed);
      qualified = [...qualified, ...promoted];
      disqualified = disqualified.slice(needed);
      console.log(`[DealUW] Promoted ${promoted.length} disqualified comps to meet 3-comp minimum`);
    }

    return NextResponse.json({
      available: true, comps: rawComps,
      qualified, disqualified,
      raw_count: rawComps.length, source: 'web_search',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Comp lookup failed';
    return NextResponse.json({
      available: false, error: message, fallback: 'manual',
      qualified: [], disqualified: [], raw_count: 0,
    });
  }
}

function normalizeComp(c: Record<string, unknown>): Record<string, unknown> {
  const saleDate = (c.sale_date as string) || (c.saleDate as string) || '';
  let daysOld = 0;
  if (saleDate) {
    const sale = new Date(saleDate);
    daysOld = Math.floor((Date.now() - sale.getTime()) / (1000 * 60 * 60 * 24));
  }
  const sqft = Number(c.sqft) || Number(c.squareFootage) || 0;
  const salePrice = Number(c.sale_price) || Number(c.salePrice) || 0;

  return {
    address: (c.address as string) || '',
    sale_price: salePrice,
    sale_date: saleDate,
    days_old: daysOld,
    sqft,
    lot_sqft: Number(c.lot_sqft) || Number(c.lotSqft) || Number(c.lot_size) || 0,
    beds: Number(c.beds) || Number(c.bedrooms) || 0,
    baths: Number(c.baths) || Number(c.bathrooms) || 0,
    year_built: Number(c.year_built) || Number(c.yearBuilt) || 0,
    property_type: (c.property_type as string) || (c.propertyType as string) || '',
    distance_miles: Number(c.distance_miles) || Number(c.distance) || 0,
    same_subdivision: c.same_subdivision === true || c.sameSubdivision === true,
    crosses_major_road: false,
    has_pool: !!c.has_pool || !!c.hasPool,
    has_garage: !!c.has_garage || !!c.hasGarage || (Number(c.garage_count) || 0) > 0,
    garage_count: Number(c.garage_count) || Number(c.garageCount) || 0,
    has_carport: !!c.has_carport || !!c.hasCarport,
    has_basement: !!c.has_basement || !!c.hasBasement,
    basement_sqft: Number(c.basement_sqft) || Number(c.basementSqft) || 0,
    has_guest_house: false,
    guest_house_sqft: 0,
    subdivision: (c.subdivision as string) || null,
    price_per_sqft: sqft > 0 ? Math.round((salePrice / sqft) * 100) / 100 : 0,
    source: (c.source as string) || 'web_search',
  };
}
