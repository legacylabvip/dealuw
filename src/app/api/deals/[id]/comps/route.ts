import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const body = await request.json();
  const comps = Array.isArray(body) ? body : [body];

  const stmt = db.prepare(`
    INSERT INTO comps (
      deal_id, address, sale_price, sale_date, days_old,
      sqft, lot_sqft, beds, baths, year_built, property_type,
      distance_miles, same_subdivision, crosses_major_road,
      price_per_sqft, adjusted_price, adjustments,
      selected, disqualified, disqualified_reason
    ) VALUES (
      @deal_id, @address, @sale_price, @sale_date, @days_old,
      @sqft, @lot_sqft, @beds, @baths, @year_built, @property_type,
      @distance_miles, @same_subdivision, @crosses_major_road,
      @price_per_sqft, @adjusted_price, @adjustments,
      @selected, @disqualified, @disqualified_reason
    )
  `);

  const insertMany = db.transaction((comps: Record<string, unknown>[]) => {
    const results: unknown[] = [];
    for (const comp of comps) {
      const result = stmt.run({
        deal_id: Number(id),
        address: comp.address || null,
        sale_price: comp.sale_price || null,
        sale_date: comp.sale_date || null,
        days_old: comp.days_old || null,
        sqft: comp.sqft || null,
        lot_sqft: comp.lot_sqft || null,
        beds: comp.beds || null,
        baths: comp.baths || null,
        year_built: comp.year_built || null,
        property_type: comp.property_type || null,
        distance_miles: comp.distance_miles || null,
        same_subdivision: comp.same_subdivision ? 1 : 0,
        crosses_major_road: comp.crosses_major_road ? 1 : 0,
        price_per_sqft: comp.price_per_sqft || null,
        adjusted_price: comp.adjusted_price || null,
        adjustments: comp.adjustments ? JSON.stringify(comp.adjustments) : null,
        selected: comp.selected !== false ? 1 : 0,
        disqualified: comp.disqualified ? 1 : 0,
        disqualified_reason: comp.disqualified_reason || null,
      });
      const inserted = db.prepare('SELECT * FROM comps WHERE id = ?').get(result.lastInsertRowid);
      results.push(inserted);
    }
    return results;
  });

  const inserted = insertMany(comps);
  return NextResponse.json(inserted, { status: 201 });
}
