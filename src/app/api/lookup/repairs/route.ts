import { NextRequest, NextResponse } from 'next/server';
import { analyzePhotos, extractFromZoriaResponse } from '@/lib/zoriaLookup';

export async function POST(req: NextRequest) {
  try {
    const { photos, property } = await req.json();

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: 'Photos are required' }, { status: 400 });
    }

    if (!property) {
      return NextResponse.json({ error: 'Property data is required' }, { status: 400 });
    }

    if (photos.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos allowed' }, { status: 400 });
    }

    // Call Zoria for photo analysis
    const rawResponse = await analyzePhotos(photos, property);
    const parsed = extractFromZoriaResponse(rawResponse);

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({
        error: 'Failed to parse repair analysis from Zoria',
        fallback: 'algorithmic',
      }, { status: 422 });
    }

    // Normalize the repair estimate
    const lineItems = (parsed.line_items || []).map((item: Record<string, unknown>) => ({
      category: (item.category as string) || 'other',
      description: (item.description as string) || '',
      estimate_low: Math.round(Number(item.estimate_low) || 0),
      estimate_high: Math.round(Number(item.estimate_high) || 0),
      recommended: Math.round(Number(item.recommended) || 0),
      urgency: (item.urgency as string) || 'medium',
    }));

    const totalLow = lineItems.reduce((s: number, i: { estimate_low: number }) => s + i.estimate_low, 0);
    const totalHigh = lineItems.reduce((s: number, i: { estimate_high: number }) => s + i.estimate_high, 0);
    const totalRecommended = lineItems.reduce((s: number, i: { recommended: number }) => s + i.recommended, 0);

    return NextResponse.json({
      mode: 'ai_photo',
      overall_condition: (parsed.overall_condition as string) || 'fair',
      confidence: (parsed.confidence as string) || 'medium',
      line_items: lineItems,
      total_low: totalLow,
      total_high: totalHigh,
      total_recommended: totalRecommended,
      notes: (parsed.notes as string) || '',
      source: 'zoria',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Photo analysis failed';
    return NextResponse.json({ error: message, fallback: 'algorithmic' }, { status: 500 });
  }
}
