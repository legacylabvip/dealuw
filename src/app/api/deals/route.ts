import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET() {
  const db = getDb();
  const deals = db.prepare('SELECT * FROM deals ORDER BY created_at DESC').all();
  return NextResponse.json(deals);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();

  const stmt = db.prepare(`
    INSERT INTO deals (
      address, city, state, zip, beds, baths, sqft, lot_sqft,
      year_built, property_type, condition, has_pool, has_garage,
      garage_count, has_carport, has_basement, basement_sqft,
      has_guest_house, guest_house_sqft, traffic_commercial,
      asking_price, notes, created_by
    ) VALUES (
      @address, @city, @state, @zip, @beds, @baths, @sqft, @lot_sqft,
      @year_built, @property_type, @condition, @has_pool, @has_garage,
      @garage_count, @has_carport, @has_basement, @basement_sqft,
      @has_guest_house, @guest_house_sqft, @traffic_commercial,
      @asking_price, @notes, @created_by
    )
  `);

  const result = stmt.run({
    address: body.address,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    beds: body.beds || null,
    baths: body.baths || null,
    sqft: body.sqft || null,
    lot_sqft: body.lot_sqft || null,
    year_built: body.year_built || null,
    property_type: body.property_type || null,
    condition: body.condition || null,
    has_pool: body.has_pool ? 1 : 0,
    has_garage: body.has_garage ? 1 : 0,
    garage_count: body.garage_count || 0,
    has_carport: body.has_carport ? 1 : 0,
    has_basement: body.has_basement ? 1 : 0,
    basement_sqft: body.basement_sqft || 0,
    has_guest_house: body.has_guest_house ? 1 : 0,
    guest_house_sqft: body.guest_house_sqft || 0,
    traffic_commercial: body.traffic_commercial || 'none',
    asking_price: body.asking_price || null,
    notes: body.notes || null,
    created_by: body.created_by || 'gradey',
  });

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(deal, { status: 201 });
}
