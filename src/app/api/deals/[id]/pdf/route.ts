import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { generateDealPDF } from '@/lib/generatePDF';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const comps = db.prepare('SELECT * FROM comps WHERE deal_id = ? AND disqualified = 0 ORDER BY created_at DESC').all(id) as Record<string, unknown>[];

  // Parse JSON fields stored in the deal
  let repairEstimate = null;
  let adjustedComps = comps;
  try {
    if (deal.repair_breakdown) repairEstimate = JSON.parse(deal.repair_breakdown as string);
  } catch { /* ignore */ }
  try {
    if (deal.comps_data) adjustedComps = JSON.parse(deal.comps_data as string);
  } catch { /* ignore */ }

  // Reconstruct allOffers from deal data if available
  let allOffers = null;
  if (deal.arv_adjusted && Number(deal.arv_adjusted) > 0) {
    try {
      const { calculateAllOffers } = await import('@/lib/offerCalculator');
      allOffers = calculateAllOffers({
        arv: Number(deal.arv_adjusted),
        repairs: Number(deal.repair_estimate) || 0,
        asking_price: deal.asking_price ? Number(deal.asking_price) : null,
        property: deal,
        market_rent: null,
      });
    } catch { /* ignore */ }
  }

  const pdfData = {
    subject: {
      address: deal.address,
      city: deal.city,
      state: deal.state,
      zip: deal.zip,
      beds: deal.beds,
      baths: deal.baths,
      sqft: deal.sqft,
      lot_sqft: deal.lot_sqft,
      year_built: deal.year_built,
      property_type: deal.property_type,
      condition: deal.condition,
      has_pool: Boolean(deal.has_pool),
      has_garage: Boolean(deal.has_garage),
      garage_count: deal.garage_count,
      has_carport: Boolean(deal.has_carport),
      has_basement: Boolean(deal.has_basement),
      basement_sqft: deal.basement_sqft,
      has_guest_house: Boolean(deal.has_guest_house),
      guest_house_sqft: deal.guest_house_sqft,
      asking_price: deal.asking_price,
      seller_motivation: null,
      seller_timeline: null,
    },
    arvResult: deal.arv_adjusted ? {
      arv: Number(deal.arv_adjusted),
      method: 'Weighted average of adjusted comps',
      confidence: deal.confidence || 'low',
      confidence_reasoning: '',
    } : null,
    repairEstimate,
    allOffers,
    adjusted: adjustedComps,
    generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    confidence: deal.confidence || 'low',
  };

  const pdfBuffer = generateDealPDF(pdfData);

  const address = (deal.address as string || 'deal').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="DealUW_${address}.pdf"`,
    },
  });
}
