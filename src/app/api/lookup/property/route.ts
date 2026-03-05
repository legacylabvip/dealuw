import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { lookupProperty, extractFromZoriaResponse } from '@/lib/zoriaLookup';

export async function POST(req: NextRequest) {
  try {
    const { address, city, state, zip } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Check cache first
    const db = getDb();
    ensureCacheTable(db);
    const cacheKey = `${address}|${city}|${state}|${zip}`.toLowerCase();
    const cached = db.prepare('SELECT data FROM lookup_cache WHERE cache_key = ? AND type = ? AND created_at > datetime("now", "-7 days")').get(cacheKey, 'property') as { data: string } | undefined;

    if (cached) {
      const data = JSON.parse(cached.data);
      return NextResponse.json({ available: true, property: data, source: 'zoria', cached: true });
    }

    // Call Zoria
    const rawResponse = await lookupProperty(address, city || '', state || '', zip || '');
    const parsed = extractFromZoriaResponse(rawResponse);

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({
        available: false,
        error: 'lookup_failed',
        fallback: 'manual',
        raw: typeof rawResponse === 'string' ? rawResponse.slice(0, 500) : undefined,
      });
    }

    // Normalize the property data
    const property = normalizeProperty(parsed, address, city, state, zip);

    // Cache it
    db.prepare('INSERT OR REPLACE INTO lookup_cache (cache_key, type, data, created_at) VALUES (?, ?, ?, datetime("now"))').run(cacheKey, 'property', JSON.stringify(property));

    return NextResponse.json({ available: true, property, source: 'zoria' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Property lookup failed';
    return NextResponse.json({ available: false, error: message, fallback: 'manual' });
  }
}

function normalizeProperty(p: Record<string, unknown>, address: string, city: string, state: string, zip: string) {
  return {
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
