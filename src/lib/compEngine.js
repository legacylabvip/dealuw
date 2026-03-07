// DealUW Comp Engine — The brain of DealUW
// Takes a subject property and raw comps, filters/adjusts/ranks them
// using professional appraisal standards.

import { COMP_RULES, ADJUSTMENTS } from './compRules.js';

// Helper: calculate days between a date string and today
function daysBetween(dateStr, referenceDate = new Date()) {
  const sale = new Date(dateStr);
  const diff = referenceDate.getTime() - sale.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Helper: get bedroom adjustment amount based on ARV price range
function getBedroomAdjustment(estimatedArv) {
  if (estimatedArv >= 400000) return ADJUSTMENTS.bedroom.over400k;
  if (estimatedArv >= 200000) return ADJUSTMENTS.bedroom.mid;
  return ADJUSTMENTS.bedroom.under200k;
}

// Helper: calculate effective sqft accounting for basement/guest house at 50%
function effectiveSqft(property) {
  let sqft = property.sqft || 0;
  if (property.has_basement && property.basement_sqft > 0) {
    sqft += property.basement_sqft * COMP_RULES.basementGuestHouseMultiplier;
  }
  if (property.has_guest_house && property.guest_house_sqft > 0) {
    sqft += property.guest_house_sqft * COMP_RULES.basementGuestHouseMultiplier;
  }
  return sqft;
}

// Helper: median of an array of numbers
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// =============================================================================
// STEP 1 — FILTER COMPS
// =============================================================================

export function filterComps(subject, rawComps, referenceDate = new Date()) {
  const qualified = [];
  const disqualified = [];

  for (const comp of rawComps) {
    const reasons = [];
    const warnings = [];
    const daysOld = comp.days_old != null ? comp.days_old : daysBetween(comp.sale_date, referenceDate);
    const compWithAge = { ...comp, days_old: daysOld };

    // Rule 1 — AGE: prefer within 180 days, hard cutoff at 365
    if (daysOld > 365) {
      reasons.push(`Sold ${daysOld} days ago (max 365)`);
    } else if (daysOld > COMP_RULES.maxAge) {
      // 180-365 days: allow with warning (penalty applied in adjustComps)
      warnings.push(`Sold ${daysOld} days ago (ideal < ${COMP_RULES.maxAge}) — aging penalty will apply`);
    }

    // Rule 2 — SQUARE FOOTAGE: within +/- 250 sqft
    if (subject.sqft && comp.sqft) {
      const diff = Math.abs(subject.sqft - comp.sqft);
      if (diff > COMP_RULES.maxSqftDifference) {
        reasons.push(`Sqft difference: ${diff} (max ${COMP_RULES.maxSqftDifference})`);
      }
    }

    // Rule 3 — PROPERTY TYPE: must match (normalize single-family variants)
    if (subject.property_type && comp.property_type) {
      const subType = subject.property_type.toLowerCase().trim();
      const compType = comp.property_type.toLowerCase().trim();
      // If types match exactly, skip
      if (subType !== compType) {
        const isSingleFamily = (t) => {
          // Check against known single-family keywords
          const sfKeywords = ['ranch', '2-story', 'split-level', 'historic', 'single family', 'single-family',
            'sfr', 'house', 'detached', 'bungalow', 'cape cod', 'colonial', 'craftsman', 'cottage',
            'tudor', 'victorian', 'residential', 'single'];
          return sfKeywords.some(kw => t.includes(kw) || kw.includes(t));
        };
        if (!(isSingleFamily(subType) && isSingleFamily(compType))) {
          reasons.push(`Type mismatch: ${comp.property_type} vs ${subject.property_type}`);
        }
      }
    }

    // Rule 4 — BUILD DATE: within +/- 10 years (relaxed for older homes)
    if (subject.year_built && comp.year_built) {
      const diff = Math.abs(subject.year_built - comp.year_built);
      // For homes built before 1960, use 30-year tolerance (older neighborhoods have mixed eras)
      const maxDiff = (subject.year_built < 1960 || comp.year_built < 1960) ? 30 : COMP_RULES.maxYearBuiltDifference;
      if (diff > maxDiff) {
        reasons.push(`Year built difference: ${diff} years (max ${maxDiff})`);
      } else if (diff > COMP_RULES.maxYearBuiltDifference) {
        warnings.push(`Year built difference: ${diff} years (relaxed for older homes)`);
      }
    }

    // Rule 5 — LOT SIZE: within +/- 2,500 sqft
    if (subject.lot_sqft && comp.lot_sqft) {
      const diff = Math.abs(subject.lot_sqft - comp.lot_sqft);
      if (diff > COMP_RULES.maxLotSqftDifference) {
        reasons.push(`Lot size difference: ${diff} sqft (max ${COMP_RULES.maxLotSqftDifference.toLocaleString()})`);
      }
    }

    // Rule 6 — MAJOR ROADS: disqualify if crosses
    if (comp.crosses_major_road) {
      reasons.push('Crosses major road from subject property');
    }

    // Rule 7 — SUBDIVISION: preferred but not required
    if (subject.subdivision && comp.subdivision) {
      if (subject.subdivision.toLowerCase() !== comp.subdivision.toLowerCase()) {
        warnings.push('Different subdivision — verify comparability');
        compWithAge.different_subdivision = true;
      }
    }
    if (comp.same_subdivision === false) {
      warnings.push('Different subdivision — verify comparability');
      compWithAge.different_subdivision = true;
    }

    if (reasons.length > 0) {
      disqualified.push({
        ...compWithAge,
        disqualified: true,
        disqualified_reasons: reasons,
        warnings,
      });
    } else {
      qualified.push({
        ...compWithAge,
        disqualified: false,
        disqualified_reasons: [],
        warnings,
        same_subdivision: comp.same_subdivision !== false && !compWithAge.different_subdivision,
      });
    }
  }

  // Sort qualified: same_subdivision first, then by distance (closest), then by days_old (newest)
  qualified.sort((a, b) => {
    // Same subdivision first
    if (a.same_subdivision && !b.same_subdivision) return -1;
    if (!a.same_subdivision && b.same_subdivision) return 1;
    // Then by distance (closest first)
    const distA = a.distance_miles ?? Infinity;
    const distB = b.distance_miles ?? Infinity;
    if (distA !== distB) return distA - distB;
    // Then by days_old (newest first)
    return (a.days_old || 0) - (b.days_old || 0);
  });

  return { qualified, disqualified };
}

// =============================================================================
// STEP 2 — ADJUST COMPS
// =============================================================================

export function adjustComps(subject, qualifiedComps, estimatedArv = null) {
  // Use estimated ARV to determine bedroom adjustment tier
  // If not provided, estimate from average comp sale price
  const avgPrice = estimatedArv || (
    qualifiedComps.length > 0
      ? qualifiedComps.reduce((sum, c) => sum + c.sale_price, 0) / qualifiedComps.length
      : 250000
  );

  const bedroomAdj = getBedroomAdjustment(avgPrice);

  return qualifiedComps.map((comp) => {
    let adjustedPrice = comp.sale_price;
    const adjustments = [];

    // BEDROOM ADJUSTMENT
    if (subject.beds != null && comp.beds != null && subject.beds !== comp.beds) {
      const diff = subject.beds - comp.beds;
      // If comp has MORE beds than subject, subject is worth less relative to comp → subtract from comp price
      // If comp has FEWER beds than subject, subject is worth more → add to comp price
      const amount = diff * bedroomAdj;
      adjustedPrice += amount;
      adjustments.push({
        type: 'bedroom',
        amount,
        reason: `Bedroom adjustment: comp has ${comp.beds} beds vs subject ${subject.beds} beds → ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}`,
      });
    }

    // BATHROOM ADJUSTMENT
    if (subject.baths != null && comp.baths != null && subject.baths !== comp.baths) {
      const diff = subject.baths - comp.baths;
      const amount = diff * ADJUSTMENTS.bathroom;
      adjustedPrice += amount;
      adjustments.push({
        type: 'bathroom',
        amount,
        reason: `Bathroom adjustment: ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}`,
      });
    }

    // GARAGE ADJUSTMENT
    const subjectHasGarage = subject.has_garage || subject.garage_count > 0;
    const compHasGarage = comp.has_garage || comp.garage_count > 0;
    const subjectGarageCount = subject.garage_count || (subjectHasGarage ? 1 : 0);
    const compGarageCount = comp.garage_count || (compHasGarage ? 1 : 0);

    if (subjectGarageCount !== compGarageCount) {
      const diff = subjectGarageCount - compGarageCount;
      const amount = diff * ADJUSTMENTS.garage;
      adjustedPrice += amount;
      adjustments.push({
        type: 'garage',
        amount,
        reason: `Garage adjustment: ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}`,
      });
    }

    // CARPORT ADJUSTMENT
    const subjectHasCarport = !!subject.has_carport;
    const compHasCarport = !!comp.has_carport;
    if (subjectHasCarport !== compHasCarport) {
      const amount = subjectHasCarport ? ADJUSTMENTS.carport : -ADJUSTMENTS.carport;
      adjustedPrice += amount;
      adjustments.push({
        type: 'carport',
        amount,
        reason: `Carport adjustment: ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}`,
      });
    }

    // POOL ADJUSTMENT
    const subjectHasPool = !!subject.has_pool;
    const compHasPool = !!comp.has_pool;
    if (subjectHasPool !== compHasPool) {
      const amount = subjectHasPool ? ADJUSTMENTS.pool : -ADJUSTMENTS.pool;
      adjustedPrice += amount;
      adjustments.push({
        type: 'pool',
        amount,
        reason: `Pool adjustment: ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}`,
      });
    }

    // BASEMENT / GUEST HOUSE SQFT RULE
    const subjectEffSqft = effectiveSqft(subject);
    const compEffSqft = effectiveSqft(comp);
    if (subjectEffSqft !== (subject.sqft || 0) || compEffSqft !== (comp.sqft || 0)) {
      const subjectLabel = subjectEffSqft !== (subject.sqft || 0)
        ? `Subject effective sqft: ${subjectEffSqft} (main ${subject.sqft} + 50% basement/guest house)`
        : null;
      const compLabel = compEffSqft !== (comp.sqft || 0)
        ? `Comp effective sqft: ${compEffSqft} (main ${comp.sqft} + 50% basement/guest house)`
        : null;
      const labels = [subjectLabel, compLabel].filter(Boolean).join('; ');
      adjustments.push({
        type: 'basement_guest_house',
        amount: 0,
        reason: `Basement/guest house at 50% value: ${labels}`,
      });
    }

    // AGE PENALTY
    const daysOld = comp.days_old || 0;
    if (daysOld > COMP_RULES.maxAge) {
      // 180-365 days: apply -10% to -20% based on age
      const pct = daysOld > 270 ? 0.15 : 0.10;
      const penalty = -(adjustedPrice * pct);
      adjustedPrice += penalty;
      adjustments.push({
        type: 'aging_penalty',
        amount: penalty,
        reason: `Aging comp penalty (${daysOld} days, over 180): -${Math.round(pct * 100)}%`,
      });
    } else if (daysOld >= COMP_RULES.agingThreshold) {
      // 150-180 days: apply -5%
      const penalty = -(adjustedPrice * COMP_RULES.agingPenalty);
      adjustedPrice += penalty;
      adjustments.push({
        type: 'aging_penalty',
        amount: penalty,
        reason: `Aging comp penalty (${daysOld} days, 150+ threshold): -5%`,
      });
    } else if (daysOld >= COMP_RULES.agingWarningThreshold) {
      // 120-150 days: flag only
      adjustments.push({
        type: 'aging_warning',
        amount: 0,
        reason: `Aging comp warning (${daysOld} days) — no adjustment yet`,
      });
    }

    // Calculate price per sqft using effective sqft
    const pricePerSqft = compEffSqft > 0 ? adjustedPrice / compEffSqft : 0;

    return {
      ...comp,
      adjusted_price: Math.round(adjustedPrice),
      adjustments,
      price_per_sqft: Math.round(pricePerSqft * 100) / 100,
      total_adjustment: Math.round(adjustedPrice - comp.sale_price),
    };
  });
}

// =============================================================================
// STEP 3 — CALCULATE ARV
// =============================================================================

export function calculateARV(subject, adjustedComps) {
  const warnings = [];
  const compsUsed = adjustedComps.slice(0, 5); // Top 3-5

  if (compsUsed.length === 0) {
    return {
      arv: 0,
      confidence: 'low',
      confidence_reasoning: 'No qualified comps available',
      method: 'No comps',
      comps_used: [],
      adjustments_summary: [],
      warnings: ['No qualified comps — cannot calculate ARV'],
    };
  }

  // Use MEDIAN adjusted price (resists outliers)
  const adjustedPrices = compsUsed.map((c) => c.adjusted_price);
  const medianPrice = median(adjustedPrices);

  // Normalize for size: multiply median by (subject_sqft / median_comp_sqft)
  const compSqfts = compsUsed.map((c) => effectiveSqft(c) || c.sqft || 0).filter((s) => s > 0);
  const medianCompSqft = compSqfts.length > 0 ? median(compSqfts) : 0;
  const subjectEffSqft = effectiveSqft(subject);

  let arv = medianPrice;
  if (medianCompSqft > 0 && subjectEffSqft > 0 && medianCompSqft !== subjectEffSqft) {
    arv = medianPrice * (subjectEffSqft / medianCompSqft);
    warnings.push(`Size-normalized: median $${medianPrice.toLocaleString()} x (${subjectEffSqft} / ${medianCompSqft} sqft)`);
  }

  // Apply traffic/commercial adjustment to ARV
  const trafficType = subject.traffic_commercial;
  let trafficAdjustment = 0;
  if (trafficType && trafficType !== 'none') {
    const isOver500k = arv > 500000;
    if (isOver500k) {
      const pct = ADJUSTMENTS.traffic.over500k[trafficType];
      if (pct) {
        trafficAdjustment = -(arv * pct);
        arv += trafficAdjustment;
        warnings.push(`Traffic/commercial adjustment (${trafficType}): -${(pct * 100).toFixed(0)}% = -$${Math.abs(Math.round(trafficAdjustment)).toLocaleString()}`);
      }
    } else {
      const amt = ADJUSTMENTS.traffic.under500k[trafficType];
      if (amt) {
        trafficAdjustment = -amt;
        arv += trafficAdjustment;
        warnings.push(`Traffic/commercial adjustment (${trafficType}): -$${amt.toLocaleString()}`);
      }
    }
  }

  arv = Math.round(arv);

  // Confidence scoring
  const allSameSubdivision = compsUsed.every((c) => c.same_subdivision);
  const allWithin90Days = compsUsed.every((c) => (c.days_old || 0) <= 90);
  const allWithin150Days = compsUsed.every((c) => (c.days_old || 0) <= 150);
  const maxAdjustmentPct = compsUsed.reduce((max, c) => {
    const pct = c.sale_price > 0 ? Math.abs(c.total_adjustment || 0) / c.sale_price : 0;
    return Math.max(max, pct);
  }, 0);
  const smallAdjustments = maxAdjustmentPct < 0.10;
  const moderateAdjustments = maxAdjustmentPct < 0.20;
  const hasAgingComps = compsUsed.some((c) => (c.days_old || 0) >= 150);

  let confidence;
  let confidenceReasoning;

  if (compsUsed.length >= 3 && allSameSubdivision && allWithin90Days && smallAdjustments) {
    confidence = 'high';
    confidenceReasoning = `${compsUsed.length} comps, all same subdivision, all within 90 days, small adjustments (<10%)`;
  } else if (compsUsed.length >= 3 && allWithin150Days && moderateAdjustments) {
    confidence = 'medium';
    const reasons = [];
    if (!allSameSubdivision) reasons.push('mixed subdivisions');
    if (!allWithin90Days) reasons.push('some comps 90-150 days old');
    if (!smallAdjustments) reasons.push('moderate adjustments');
    confidenceReasoning = `${compsUsed.length} comps but ${reasons.join(', ')}`;
  } else {
    confidence = 'low';
    const reasons = [];
    if (compsUsed.length < 3) reasons.push(`only ${compsUsed.length} comp(s)`);
    if (hasAgingComps) reasons.push('aging comps (150+ days)');
    if (!moderateAdjustments) reasons.push('large adjustments (>20%)');
    if (!allSameSubdivision && compsUsed.length < 3) reasons.push('crossed subdivisions');
    confidenceReasoning = reasons.join(', ') || 'insufficient data';
  }

  // Collect all adjustments summary
  const adjustmentsSummary = compsUsed.flatMap((c) =>
    (c.adjustments || []).filter((a) => a.amount !== 0).map((a) => ({
      comp_address: c.address,
      ...a,
    }))
  );

  // Add subdivision warnings
  compsUsed.forEach((c) => {
    if (c.warnings) {
      c.warnings.forEach((w) => {
        if (!warnings.includes(w)) warnings.push(w);
      });
    }
  });

  return {
    arv,
    confidence,
    confidence_reasoning: confidenceReasoning,
    method: `Median of ${compsUsed.length} adjusted comp${compsUsed.length !== 1 ? 's' : ''}`,
    comps_used: compsUsed.map((c) => ({
      address: c.address,
      sale_price: c.sale_price,
      adjusted_price: c.adjusted_price,
      days_old: c.days_old,
      adjustments: c.adjustments,
    })),
    adjustments_summary: adjustmentsSummary,
    warnings,
  };
}

// =============================================================================
// STEP 4 — CALCULATE MAO
// =============================================================================

export function calculateMAO(arv, repairEstimate, askingPrice = null, purchasePrice = null, confidence = 'medium') {
  const mao = Math.round((arv * COMP_RULES.maoMultiplier) - repairEstimate);

  const breakdown = {
    arv,
    arv_times_70: Math.round(arv * COMP_RULES.maoMultiplier),
    repair_estimate: repairEstimate,
    mao,
    formula: `MAO = ($${arv.toLocaleString()} x 0.70) - $${repairEstimate.toLocaleString()} = $${mao.toLocaleString()}`,
  };

  // Calculate spread and assignment fee
  let spread = null;
  let assignmentFee = null;

  if (askingPrice != null) {
    spread = mao - askingPrice;
    breakdown.asking_price = askingPrice;
    breakdown.spread = spread;
  }

  if (purchasePrice != null) {
    assignmentFee = mao - purchasePrice;
    breakdown.purchase_price = purchasePrice;
    breakdown.assignment_fee = assignmentFee;
  }

  // Recommendation
  let recommendation;
  const effectiveSpread = spread != null ? spread : (assignmentFee != null ? assignmentFee : null);

  if (effectiveSpread == null) {
    recommendation = 'negotiate';
    breakdown.recommendation_reasoning = 'No asking/purchase price provided — negotiate to discover price';
  } else if (effectiveSpread > 15000 && (confidence === 'high' || confidence === 'medium')) {
    recommendation = 'go';
    breakdown.recommendation_reasoning = `Spread $${effectiveSpread.toLocaleString()} > $15K with ${confidence} confidence`;
  } else if (effectiveSpread >= 0 && effectiveSpread <= 15000) {
    recommendation = 'negotiate';
    breakdown.recommendation_reasoning = `Spread $${effectiveSpread.toLocaleString()} is $0-$15K — room to negotiate`;
  } else if (effectiveSpread > 15000 && confidence === 'low') {
    recommendation = 'negotiate';
    breakdown.recommendation_reasoning = `Spread $${effectiveSpread.toLocaleString()} looks good but confidence is low — verify comps`;
  } else {
    recommendation = 'pass';
    breakdown.recommendation_reasoning = `Negative spread: $${effectiveSpread.toLocaleString()} — numbers don't work`;
  }

  return {
    mao,
    spread,
    assignment_fee: assignmentFee,
    recommendation,
    confidence,
    breakdown,
  };
}

// =============================================================================
// STEP 5 — GENERATE COMP REPORT
// =============================================================================

export function generateCompReport(subject, filteredComps, adjustedComps, arvResult, searchExpansions = []) {
  const qualified = filteredComps.filter(c => !c.disqualified);
  const disqualified = filteredComps.filter(c => c.disqualified);
  const flagged = qualified.filter(c => c.warnings && c.warnings.length > 0);

  const selectedComps = adjustedComps.map(c => ({
    address: c.address,
    sale_price: c.sale_price,
    adjusted_price: c.adjusted_price,
    sale_date: c.sale_date,
    days_old: c.days_old,
    sqft: c.sqft,
    beds: c.beds,
    baths: c.baths,
    distance: c.distance_miles,
    same_subdivision: c.same_subdivision,
    adjustments: c.adjustments || [],
    total_adjustment: c.total_adjustment || 0,
    status: c.warnings && c.warnings.length > 0 ? 'flagged' : 'qualified',
    notes: c.warnings || [],
  }));

  const disqualifiedComps = disqualified.map(c => ({
    address: c.address,
    sale_price: c.sale_price,
    sale_date: c.sale_date,
    days_old: c.days_old,
    sqft: c.sqft,
    beds: c.beds,
    baths: c.baths,
    distance: c.distance_miles,
    reasons: c.disqualified_reasons || [],
  }));

  return {
    subject: {
      address: subject.address,
      city: subject.city,
      state: subject.state,
      zip: subject.zip,
      beds: subject.beds,
      baths: subject.baths,
      sqft: subject.sqft,
      lot_sqft: subject.lot_sqft,
      year_built: subject.year_built,
      property_type: subject.property_type,
    },
    comps_searched: qualified.length + disqualified.length,
    comps_qualified: qualified.length,
    comps_disqualified: disqualified.length,
    comps_flagged: flagged.length,
    selected_comps: selectedComps,
    disqualified_comps: disqualifiedComps,
    arv: arvResult ? {
      raw: arvResult.arv,
      adjusted: arvResult.arv, // Same unless traffic/basement applied (already in ARV calc)
      confidence: arvResult.confidence,
      confidence_reasoning: arvResult.confidence_reasoning,
      method: arvResult.method,
      search_expansions: searchExpansions,
    } : null,
  };
}
