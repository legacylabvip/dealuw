import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  if (!input || !apiKey) {
    return NextResponse.json({ predictions: [] });
  }

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  return NextResponse.json({
    predictions: (data.predictions || []).slice(0, 5).map((p: { description: string; place_id: string }) => ({
      description: p.description,
      place_id: p.place_id,
    })),
  });
}
