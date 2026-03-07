import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Use the /analyze page for analysis' }, { status: 400 });
}
