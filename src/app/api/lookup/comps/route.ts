import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { lookupComps, extractFromZoriaResponse } from '@/lib/zoriaLookup';
import { filterComps } from '@/lib/compEngine';

export async function POST(req: NextRequest) {
  try {
    const { address, city, state, zip, subject_details } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const subject = subject_details || {};

    // Check cache
    const db = getDb();
    ensureCacheTable(db);
    const cacheKey = `${address}|${city}|${state}|${zip}`.toLowerCase();
    const cached = db.prepare("SELECT data FROM lookup_cache WHERE cache_key = ? AND type = ? AND created_at > datetime('now', '-1 day')").get(cacheKey, 'comps') as { data: string } | undefined;

    let rawComps: Record<string, unknown>[];

    if (cached) {
      rawComps = JSON.parse(cached.data);
    } else {
      // Call Zoria
      const rawResponse = await lookupComps(address, city || '', state || '', zip || '', subject);
      const parsed = extractFromZoriaResponse(rawResponse);

      if (!parsed || !Array.isArray(parsed)) {
        // Try to handle if parsed is an object with a comps array
        const compsArray = parsed?.comps || parsed?.results || parsed?.comparables;
        if (Array.isArray(compsArray)) {
          rawComps = compsArray.map(normalizeComp);
        } else {
          return NextResponse.json({
            available: false,
            error: 'lookup_failed',
            fallback: 'manual',
            qualified: [],
            disqualified: [],
            raw_count: 0,
          });
        }
      } else {
        rawComps = parsed.map(normalizeComp);
      }

      // Cache
      db.prepare("INSERT OR REPLACE INTO lookup_cache (cache_key, type, data, created_at) VALUES (?, ?, ?, datetime('now'))").run(cacheKey, 'comps', JSON.stringify(rawComps));
    }

    // Run through comp engine filter
    const filtered = filterComps(subject, rawComps);

    return NextResponse.json({
      available: true,
      comps: rawComps,
      qualified: filtered.qualified,
      disqualified: filtered.disqualified,
      raw_count: rawComps.length,
      source: 'zoria',
      cached: !!cached,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Comp lookup failed';
    return NextResponse.json({
      available: false,
      error: message,
      fallback: 'manual',
      qualified: [],
      disqualified: [],
      raw_count: 0,
    });
  }
}

function normalizeComp(c: Record<string, unknown>): Record<string, unknown> {
  const saleDate = (c.sale_date as string) || (c.saleDate as string) || '';
  let daysOld = 0;
  if (saleDate) {
    const sale = new Date(saleDate);
    const now = new Date();
    daysOld = Math.floor((now.getTime() - sale.getTime()) / (1000 * 60 * 60 * 24));
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
    has_garage: !!c.has_garage || !!c.hasGarage || (Number(c.garage_count) || Number(c.garageCount) || 0) > 0,
    garage_count: Number(c.garage_count) || Number(c.garageCount) || 0,
    has_carport: !!c.has_carport || !!c.hasCarport,
    has_basement: !!c.has_basement || !!c.hasBasement,
    basement_sqft: Number(c.basement_sqft) || Number(c.basementSqft) || 0,
    has_guest_house: false,
    guest_house_sqft: 0,
    subdivision: (c.subdivision as string) || null,
    price_per_sqft: sqft > 0 ? Math.round((salePrice / sqft) * 100) / 100 : 0,
    source: (c.source as string) || 'zoria',
  };
}

function ensureCacheTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lookup_cache (
      cache_key TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cache_key, type)
    )
  `);
}
