import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    analyzing: [],
    offered: [],
    under_contract: [],
    dispo: [],
    closed: [],
    passed: [],
  });
}
