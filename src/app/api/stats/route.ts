import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    total_deals: 0,
    active_deals: 0,
    closed_this_month: 0,
    avg_arv: 0,
    pipeline_value: 0,
    recommendations: { go: 0, negotiate: 0, pass: 0 },
  });
}
