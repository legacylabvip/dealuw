import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Redirect to the main estimate-repairs route which handles both photo and algorithmic
  const body = await req.json();
  const { photos, property } = body;

  if (!property) {
    return NextResponse.json({ error: 'Property data is required' }, { status: 400 });
  }

  // Forward to estimate-repairs internally
  const baseUrl = req.nextUrl.origin;
  const res = await fetch(`${baseUrl}/api/estimate-repairs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      property,
      photos: photos || undefined,
      mode: photos?.length > 0 ? 'ai_photo' : 'algorithmic',
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
