import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);

  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const comps = db.prepare('SELECT * FROM comps WHERE deal_id = ? ORDER BY created_at DESC').all(id);
  return NextResponse.json({ ...deal as Record<string, unknown>, comps });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const body = await request.json();

  const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const fields = Object.keys(body)
    .filter((key) => key !== 'id' && key !== 'created_at')
    .map((key) => `${key} = @${key}`)
    .join(', ');

  if (!fields) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const stmt = db.prepare(`UPDATE deals SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
  stmt.run({ ...body, id });

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  return NextResponse.json(deal);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  db.prepare('DELETE FROM deals WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
