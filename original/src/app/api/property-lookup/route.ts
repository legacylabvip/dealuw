import { NextRequest, NextResponse } from 'next/server';
import { lookupProperty, isAutoLookupAvailable, getProviderName } from '@/lib/propertyLookup';

export async function POST(req: NextRequest) {
  try {
    if (!isAutoLookupAvailable()) {
      return NextResponse.json({
        available: false,
        error: 'Auto-pull unavailable. No RE data API key configured. Enter details manually.',
      });
    }

    const { address, city, state, zip } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const result = await lookupProperty(address, city || '', state || '', zip || '');
    return NextResponse.json({ ...result, provider: getProviderName() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Property lookup failed';
    return NextResponse.json({ available: false, error: message });
  }
}

export async function GET() {
  return NextResponse.json({
    available: isAutoLookupAvailable(),
    provider: getProviderName(),
  });
}
