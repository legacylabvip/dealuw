import { NextResponse } from 'next/server';
import { getAllRules } from '@/lib/rules';

export async function GET() {
  return NextResponse.json(getAllRules());
}
