import { NextRequest, NextResponse } from 'next/server';
import { estimateFromPhotos, algorithmicEstimate } from '@/lib/repairEstimator';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { property, photos, mode } = body;

    if (!property) {
      return NextResponse.json({ error: 'Property data is required' }, { status: 400 });
    }

    if (mode === 'ai_photo' && photos?.length > 0) {
      if (photos.length > 10) {
        return NextResponse.json({ error: 'Maximum 10 photos allowed' }, { status: 400 });
      }
      const result = await estimateFromPhotos(property, photos);
      return NextResponse.json(result);
    }

    // Algorithmic fallback
    const result = algorithmicEstimate(property);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Repair estimation failed';
    const status = message.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
