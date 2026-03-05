import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export async function GET() {
  const db = getDb();

  const pipeline = {
    analyzing: db.prepare("SELECT * FROM deals WHERE status = 'analyzing' ORDER BY updated_at DESC").all(),
    offered: db.prepare("SELECT * FROM deals WHERE status = 'offered' ORDER BY updated_at DESC").all(),
    under_contract: db.prepare("SELECT * FROM deals WHERE status = 'under_contract' ORDER BY updated_at DESC").all(),
    dispo: db.prepare("SELECT * FROM deals WHERE status = 'dispo' ORDER BY updated_at DESC").all(),
    closed: db.prepare("SELECT * FROM deals WHERE status = 'closed' ORDER BY updated_at DESC").all(),
    passed: db.prepare("SELECT * FROM deals WHERE status = 'passed' ORDER BY updated_at DESC").all(),
  };

  return NextResponse.json(pipeline);
}
