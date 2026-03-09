import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json({ apiKey: null });
  }
  return NextResponse.json({ apiKey });
}
