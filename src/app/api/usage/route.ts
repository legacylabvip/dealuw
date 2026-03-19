import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canAnalyze, incrementAnalysisCount } from '@/lib/usage';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await canAnalyze(user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: 'Failed to check usage' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const check = await canAnalyze(user.id);
    if (!check.allowed) {
      return NextResponse.json(
        { error: check.reason, usage: check.usage },
        { status: 403 }
      );
    }

    await incrementAnalysisCount(user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to increment usage' },
      { status: 500 }
    );
  }
}
