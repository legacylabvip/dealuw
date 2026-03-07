import { NextRequest, NextResponse } from 'next/server';

// In-memory store for deals (resets on serverless cold start)
// TODO: Replace with Vercel Postgres for persistence
const deals: Record<string, unknown>[] = [];

export async function GET() {
  return NextResponse.json(deals);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const deal = {
    id: Date.now(),
    ...body,
    status: body.status || 'analyzing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  deals.push(deal);
  return NextResponse.json(deal, { status: 201 });
}
