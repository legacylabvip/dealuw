import { NextRequest, NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return NextResponse.json({ error: 'Deal not found', id }, { status: 404 });
}

export async function PUT(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return NextResponse.json({ error: 'Deal not found', id }, { status: 404 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return NextResponse.json({ error: 'Deal not found', id }, { status: 404 });
}
