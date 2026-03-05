import { NextRequest, NextResponse } from 'next/server';
import { pullComps, isAutoLookupAvailable, getProviderName } from '@/lib/propertyLookup';

export async function POST(req: NextRequest) {
  try {
    if (!isAutoLookupAvailable()) {
      return NextResponse.json({
        available: false,
        comps: [],
        expansions: [],
        error: 'Auto-pull unavailable. No RE data API key configured. Add comps manually.',
      });
    }

    const { property } = await req.json();
    if (!property || !property.address) {
      return NextResponse.json({ error: 'Property data with address is required' }, { status: 400 });
    }

    const result = await pullComps(property);
    return NextResponse.json({ ...result, provider: getProviderName() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Comp pull failed';
    return NextResponse.json({ available: false, comps: [], expansions: [], error: message });
  }
}
