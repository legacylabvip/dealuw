import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithAI } from '@/lib/aiAnalysis';

export async function POST(req: NextRequest) {
  try {
    const dealData = await req.json();

    if (!dealData.subject || !dealData.arvResult || !dealData.maoResult) {
      return NextResponse.json(
        { error: 'Missing required deal data' },
        { status: 400 }
      );
    }

    const result = await analyzeWithAI(dealData);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI analysis failed';
    const status = message.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
