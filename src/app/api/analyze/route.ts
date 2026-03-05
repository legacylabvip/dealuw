import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import {
  COMP_RULES,
  ADJUSTMENT_RULES,
  TRAFFIC_COMMERCIAL_RULES,
  BASEMENT_GUEST_HOUSE_RULE,
  MAO_FORMULA,
} from '@/lib/rules';

interface DealRow {
  id: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  lot_sqft: number;
  year_built: number;
  property_type: string;
  has_pool: number;
  has_garage: number;
  garage_count: number;
  has_carport: number;
  has_basement: number;
  basement_sqft: number;
  has_guest_house: number;
  guest_house_sqft: number;
  traffic_commercial: string;
  asking_price: number;
}

interface CompRow {
  id: number;
  deal_id: number;
  address: string;
  sale_price: number;
  sale_date: string;
  days_old: number;
  sqft: number;
  lot_sqft: number;
  beds: number;
  baths: number;
  year_built: number;
  property_type: string;
  distance_miles: number;
  same_subdivision: number;
  crosses_major_road: number;
  price_per_sqft: number;
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const dealId = body.deal_id;

  if (!dealId) {
    return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
  }

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId) as DealRow | undefined;
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const comps = db.prepare('SELECT * FROM comps WHERE deal_id = ?').all(dealId) as CompRow[];

  if (comps.length === 0) {
    return NextResponse.json({ error: 'No comps found for this deal. Add comps first.' }, { status: 400 });
  }

  const adjustmentsLog: { comp_id: number; adjustments: { type: string; amount: number; reason: string }[] }[] = [];
  let qualifiedComps = 0;

  for (const comp of comps) {
    const compAdjustments: { type: string; amount: number; reason: string }[] = [];
    let disqualified = false;
    let disqualifiedReason = '';
    let adjustedPrice = comp.sale_price;

    // Check comp age
    if (comp.days_old > COMP_RULES.maxAgeDays) {
      disqualified = true;
      disqualifiedReason = `Comp is ${comp.days_old} days old (max ${COMP_RULES.maxAgeDays})`;
    }

    // Check sqft range
    if (deal.sqft && comp.sqft && Math.abs(deal.sqft - comp.sqft) > COMP_RULES.sqftRange) {
      disqualified = true;
      disqualifiedReason += disqualifiedReason ? '; ' : '';
      disqualifiedReason += `Sqft diff ${Math.abs(deal.sqft - comp.sqft)} exceeds +/- ${COMP_RULES.sqftRange}`;
    }

    // Check lot sqft range
    if (deal.lot_sqft && comp.lot_sqft && Math.abs(deal.lot_sqft - comp.lot_sqft) > COMP_RULES.lotSqftRange) {
      disqualified = true;
      disqualifiedReason += disqualifiedReason ? '; ' : '';
      disqualifiedReason += `Lot sqft diff ${Math.abs(deal.lot_sqft - comp.lot_sqft)} exceeds +/- ${COMP_RULES.lotSqftRange}`;
    }

    // Check year built range
    if (deal.year_built && comp.year_built && Math.abs(deal.year_built - comp.year_built) > COMP_RULES.yearBuiltRange) {
      disqualified = true;
      disqualifiedReason += disqualifiedReason ? '; ' : '';
      disqualifiedReason += `Year built diff ${Math.abs(deal.year_built - comp.year_built)} exceeds +/- ${COMP_RULES.yearBuiltRange}`;
    }

    // Check property type
    if (deal.property_type && comp.property_type && deal.property_type !== comp.property_type) {
      disqualified = true;
      disqualifiedReason += disqualifiedReason ? '; ' : '';
      disqualifiedReason += `Different property type: ${comp.property_type} vs ${deal.property_type}`;
    }

    // Check crosses major road
    if (comp.crosses_major_road) {
      disqualified = true;
      disqualifiedReason += disqualifiedReason ? '; ' : '';
      disqualifiedReason += 'Crosses major road';
    }

    if (!disqualified) {
      qualifiedComps++;

      // Bedroom adjustment
      if (deal.beds && comp.beds && deal.beds !== comp.beds) {
        const diff = deal.beds - comp.beds;
        const adj = diff * ADJUSTMENT_RULES.bedroom.min;
        adjustedPrice += adj;
        compAdjustments.push({
          type: 'bedroom',
          amount: adj,
          reason: `${diff > 0 ? '+' : ''}${diff} bedroom(s) @ $${ADJUSTMENT_RULES.bedroom.min.toLocaleString()}/ea`,
        });
      }

      // Bathroom adjustment
      if (deal.baths && comp.baths && deal.baths !== comp.baths) {
        const diff = deal.baths - comp.baths;
        const adj = diff * ADJUSTMENT_RULES.bathroom;
        adjustedPrice += adj;
        compAdjustments.push({
          type: 'bathroom',
          amount: adj,
          reason: `${diff > 0 ? '+' : ''}${diff} bathroom(s) @ $${ADJUSTMENT_RULES.bathroom.toLocaleString()}/ea`,
        });
      }

      // Garage adjustment
      if (deal.has_garage && !comp.price_per_sqft) {
        // Simplified: if subject has garage and comp doesn't have comparable info
      }
      if (deal.garage_count !== undefined && comp.beds !== undefined) {
        // Garage adjustments would be applied with more comp data
      }

      // Pool adjustment
      if (deal.has_pool && comp.sale_price) {
        // If subject has pool, comp likely needs upward adjustment if no pool info
      }

      // Stale comp penalty (within 180 days but getting old)
      if (comp.days_old > 120 && comp.days_old <= COMP_RULES.maxAgeDays) {
        const penaltyPct = COMP_RULES.staleCompPenalty.min;
        const adj = -(adjustedPrice * penaltyPct);
        adjustedPrice += adj;
        compAdjustments.push({
          type: 'stale_comp',
          amount: adj,
          reason: `Comp is ${comp.days_old} days old, applying ${penaltyPct * 100}% penalty`,
        });
      }
    }

    // Update comp in database
    db.prepare(`
      UPDATE comps SET
        adjusted_price = ?,
        adjustments = ?,
        disqualified = ?,
        disqualified_reason = ?,
        selected = ?
      WHERE id = ?
    `).run(
      adjustedPrice,
      JSON.stringify(compAdjustments),
      disqualified ? 1 : 0,
      disqualifiedReason || null,
      disqualified ? 0 : 1,
      comp.id
    );

    adjustmentsLog.push({ comp_id: comp.id, adjustments: compAdjustments });
  }

  // Calculate ARV from qualified comps
  const qualifiedCompData = db.prepare(
    'SELECT * FROM comps WHERE deal_id = ? AND disqualified = 0 AND selected = 1'
  ).all(dealId) as (CompRow & { adjusted_price: number })[];

  let arvRaw = 0;
  let arvAdjusted = 0;

  if (qualifiedCompData.length > 0) {
    arvRaw = qualifiedCompData.reduce((sum, c) => sum + c.sale_price, 0) / qualifiedCompData.length;
    arvAdjusted = qualifiedCompData.reduce((sum, c) => sum + (c.adjusted_price || c.sale_price), 0) / qualifiedCompData.length;
  }

  // Apply basement/guest house rule
  if (deal.has_basement && deal.basement_sqft > 0 && deal.sqft > 0) {
    const pricePerSqft = arvAdjusted / deal.sqft;
    const basementValue = deal.basement_sqft * pricePerSqft * BASEMENT_GUEST_HOUSE_RULE.valueMultiplier;
    arvAdjusted += basementValue;
  }

  if (deal.has_guest_house && deal.guest_house_sqft > 0 && deal.sqft > 0) {
    const pricePerSqft = arvAdjusted / deal.sqft;
    const ghValue = deal.guest_house_sqft * pricePerSqft * BASEMENT_GUEST_HOUSE_RULE.valueMultiplier;
    arvAdjusted += ghValue;
  }

  // Apply traffic/commercial adjustments
  if (deal.traffic_commercial && deal.traffic_commercial !== 'none') {
    const isOver500k = arvAdjusted > 500000;
    const tc = deal.traffic_commercial as 'siding' | 'backing' | 'fronting';

    if (isOver500k) {
      const pct = TRAFFIC_COMMERCIAL_RULES.over500k[tc];
      if (pct) {
        arvAdjusted += arvAdjusted * pct;
      }
    } else {
      const amt = TRAFFIC_COMMERCIAL_RULES.under500k[tc];
      if (typeof amt === 'number') {
        arvAdjusted += amt;
      } else if (amt && typeof amt === 'object' && 'min' in amt) {
        arvAdjusted += amt.min;
      }
    }
  }

  // Estimate repairs based on condition
  const repairEstimates: Record<string, { perSqft: number }> = {
    excellent: { perSqft: 0 },
    good: { perSqft: 10 },
    fair: { perSqft: 25 },
    poor: { perSqft: 45 },
  };

  const conditionKey = (deal as DealRow & { condition?: string }).condition || 'fair';
  const repairRate = repairEstimates[conditionKey] || repairEstimates.fair;
  const repairEstimate = (deal.sqft || 1500) * repairRate.perSqft;

  const repairBreakdown = {
    condition: conditionKey,
    sqft: deal.sqft || 1500,
    rate_per_sqft: repairRate.perSqft,
    total: repairEstimate,
  };

  // Calculate MAO
  const mao = (arvAdjusted * MAO_FORMULA.arvMultiplier) - repairEstimate;

  // Determine recommendation
  let recommendation: string;
  let confidence: string;

  if (!deal.asking_price) {
    recommendation = 'negotiate';
    confidence = 'low';
  } else if (deal.asking_price <= mao) {
    recommendation = 'go';
    confidence = qualifiedComps >= 3 ? 'high' : 'medium';
  } else if (deal.asking_price <= mao * 1.1) {
    recommendation = 'negotiate';
    confidence = qualifiedComps >= 3 ? 'high' : 'medium';
  } else {
    recommendation = 'pass';
    confidence = qualifiedComps >= 3 ? 'high' : 'medium';
  }

  if (qualifiedComps < 2) {
    confidence = 'low';
  }

  const assignmentFee = mao > 0 && deal.asking_price ? mao - deal.asking_price : 0;

  // Update deal
  db.prepare(`
    UPDATE deals SET
      arv_raw = ?,
      arv_adjusted = ?,
      repair_estimate = ?,
      repair_breakdown = ?,
      mao = ?,
      assignment_fee = ?,
      recommendation = ?,
      confidence = ?,
      adjustments_applied = ?,
      comps_data = ?,
      status = 'analyzing',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    arvRaw,
    arvAdjusted,
    repairEstimate,
    JSON.stringify(repairBreakdown),
    mao,
    assignmentFee > 0 ? assignmentFee : 0,
    recommendation,
    confidence,
    JSON.stringify(adjustmentsLog),
    JSON.stringify(qualifiedCompData),
    dealId
  );

  const updatedDeal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);

  return NextResponse.json({
    deal: updatedDeal,
    analysis: {
      arv_raw: arvRaw,
      arv_adjusted: arvAdjusted,
      repair_estimate: repairEstimate,
      repair_breakdown: repairBreakdown,
      mao,
      assignment_fee: assignmentFee > 0 ? assignmentFee : 0,
      recommendation,
      confidence,
      qualified_comps: qualifiedComps,
      total_comps: comps.length,
      adjustments: adjustmentsLog,
    },
  });
}
