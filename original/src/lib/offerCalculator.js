// DealUW Offer Calculator — Three offer strategies: Cash, Owner Finance, Novation
// Takes ARV, repairs, asking price, property details, and market rent.

import { COMP_RULES } from './compRules.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function money(n) {
  return '$' + Math.round(n).toLocaleString();
}

function pct(n) {
  return (n * 100).toFixed(1) + '%';
}

function monthlyPayment(principal, annualRate, years) {
  if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function totalInterest(principal, monthlyPmt, years) {
  return (monthlyPmt * years * 12) - principal;
}

// Estimate market rent from property data (rough heuristic when not provided)
function estimateMarketRent(property, arv) {
  // The 1% rule: monthly rent ~ 1% of property value (conservative: 0.7-0.8%)
  if (arv > 0) {
    return Math.round(arv * 0.008 / 50) * 50; // 0.8% of ARV, rounded to nearest $50
  }
  // Fallback based on beds
  const beds = property.beds || 3;
  const baseLookup = { 1: 800, 2: 1000, 3: 1300, 4: 1600, 5: 1900 };
  return baseLookup[Math.min(beds, 5)] || 1300;
}

// =============================================================================
// OFFER 1 — CASH OFFER (Traditional Wholesale)
// =============================================================================

export function calculateCashOffer(arv, repairs, askingPrice = null) {
  const mao = Math.round((arv * COMP_RULES.maoMultiplier) - repairs);

  const assignmentFee = {
    conservative: Math.max(5000, Math.round(mao * 0.05)),
    target: Math.max(8000, Math.round(mao * 0.08)),
    aggressive: Math.max(10000, Math.round(mao * 0.12)),
  };

  const suggestedStartingOffer = Math.round(mao * 0.85);
  const walkAwayPrice = mao;

  // What the end buyer (flipper) makes
  const buyerProfitAtMao = arv - mao - repairs;
  const buyerTotalInvestment = mao + repairs;
  const buyerRoi = buyerTotalInvestment > 0
    ? (buyerProfitAtMao / buyerTotalInvestment) * 100
    : 0;

  // Does the math work?
  const works = mao > 0 && buyerProfitAtMao > 0 && buyerRoi >= 15;

  // Spread vs asking
  let spread = null;
  let spreadNotes = '';
  if (askingPrice != null && askingPrice > 0) {
    spread = mao - askingPrice;
    if (spread > 15000) {
      spreadNotes = `Strong deal: ${money(spread)} spread. Room for assignment fee and negotiation.`;
    } else if (spread >= 0) {
      spreadNotes = `Tight deal: only ${money(spread)} spread. Negotiate hard or consider creative finance.`;
    } else {
      spreadNotes = `Negative spread: ${money(spread)}. Cash offer won't work at asking. Try owner finance or novation.`;
    }
  }

  // Generate specific notes
  const notes = [];
  if (works) {
    notes.push(`Start at ${money(suggestedStartingOffer)}, walk away above ${money(walkAwayPrice)}.`);
    notes.push(`End buyer profit: ${money(buyerProfitAtMao)} (${buyerRoi.toFixed(1)}% ROI) — ${buyerRoi >= 20 ? 'very attractive to buyers' : 'acceptable to most buyers'}.`);
    notes.push(`Assignment fee range: ${money(assignmentFee.conservative)}-${money(assignmentFee.aggressive)}.`);
  } else if (mao <= 0) {
    notes.push('MAO is negative — repairs exceed the 70% rule. This deal needs creative finance or a much lower price.');
  } else {
    notes.push(`Buyer ROI is ${buyerRoi.toFixed(1)}% — below the 15-20% threshold most cash buyers need.`);
    notes.push('Consider reducing your offer or pivoting to owner finance/novation.');
  }
  if (spreadNotes) notes.push(spreadNotes);

  return {
    strategy: 'Cash Offer',
    mao,
    suggested_starting_offer: suggestedStartingOffer,
    walk_away_price: walkAwayPrice,
    assignment_fee: assignmentFee,
    buyer_profit_at_mao: buyerProfitAtMao,
    buyer_roi: Math.round(buyerRoi * 10) / 10,
    spread,
    asking_price: askingPrice,
    works,
    notes: notes.join(' '),
  };
}

// =============================================================================
// OFFER 2 — OWNER FINANCE (Creative Finance)
// =============================================================================

export function calculateOwnerFinance(arv, repairs, askingPrice = null, property = {}, marketRent = null) {
  // Owner finance: seller carries the note, higher price possible
  const purchasePrice = Math.round(arv * 0.80 - repairs);
  const downPaymentPct = 0.10;
  const downPayment = Math.round(purchasePrice * downPaymentPct);
  const financedAmount = purchasePrice - downPayment;
  const interestRate = 0.06;
  const termYears = 30;

  const monthlyPmt = Math.round(monthlyPayment(financedAmount, interestRate, termYears));
  const totalInt = Math.round(totalInterest(financedAmount, monthlyPmt, termYears));
  const totalSellerReceives = purchasePrice + totalInt;

  // Assignment fee for wholesaler in owner-finance deal
  const assignmentFee = Math.round(downPayment * 0.50);

  // Rental cash flow analysis
  const rent = marketRent || estimateMarketRent(property, arv);
  const monthlyCashflow = rent - monthlyPmt;
  const annualCashflow = monthlyCashflow * 12;

  // Suggested starting terms (negotiate from here)
  const suggestedStartingOffer = {
    price: Math.round(purchasePrice * 0.90),
    down_payment: Math.round(purchasePrice * 0.05),
    interest_rate: 0.04,
    term: 30,
  };

  // Does the math work?
  const works = purchasePrice > 0 && monthlyCashflow > 0;

  const notes = [];
  if (works) {
    notes.push(`Owner finance works: ${money(monthlyCashflow)}/mo positive cash flow.`);
    notes.push(`Seller gets ${money(totalSellerReceives)} total over ${termYears} years (${money(totalInt)} in interest).`);
    notes.push(`Pitch to seller: "You get ${money(purchasePrice)} — more than a cash offer — plus ${money(totalInt)} in interest income."`);
    if (askingPrice && purchasePrice >= askingPrice * 0.90) {
      notes.push('Purchase price is close to asking — owner finance can bridge the gap where cash falls short.');
    }
  } else if (purchasePrice <= 0) {
    notes.push('Purchase price is negative — repairs are too high for owner finance at 80% ARV.');
  } else {
    notes.push(`Negative cash flow: ${money(monthlyCashflow)}/mo. Rent doesn't cover payment.`);
    notes.push('Negotiate lower price, lower rate, or longer term to make it work.');
  }

  return {
    strategy: 'Owner Finance',
    purchase_price: purchasePrice,
    down_payment: downPayment,
    down_payment_pct: downPaymentPct,
    financed_amount: financedAmount,
    interest_rate: interestRate,
    term_years: termYears,
    monthly_payment: monthlyPmt,
    market_rent: rent,
    monthly_cashflow: monthlyCashflow,
    annual_cashflow: annualCashflow,
    assignment_fee: assignmentFee,
    total_interest_to_seller: totalInt,
    total_seller_receives: totalSellerReceives,
    suggested_starting_offer: suggestedStartingOffer,
    asking_price: askingPrice,
    works,
    notes: notes.join(' '),
  };
}

// =============================================================================
// OFFER 3 — NOVATION (Renovate and Sell)
// =============================================================================

export function calculateNovation(arv, repairs, askingPrice = null) {
  // Novation: agree on price, renovate, list at ARV, keep the spread
  const sellerPrice = Math.round(arv * 0.75 - (repairs * 0.50));
  const renovationCost = repairs;
  const listingPrice = Math.round(arv * 0.98);

  // Selling costs
  const agentCommission = Math.round(listingPrice * 0.05);
  const closingCosts = Math.round(listingPrice * 0.02);
  const holdingCostsMonthly = 1500;
  const estimatedHoldingMonths = 4; // 2 months rehab + 2 months on market
  const totalHoldingCosts = holdingCostsMonthly * estimatedHoldingMonths;

  const totalCosts = renovationCost + agentCommission + closingCosts + totalHoldingCosts;
  const grossProfit = listingPrice - sellerPrice - totalCosts;

  const suggestedStartingOffer = {
    seller_price: Math.round(sellerPrice * 0.90),
    profit_split: '100% to wholesaler after agreed price to seller',
    renovation_timeline: '60 days',
    listing_timeline: '90 days total',
  };

  const works = grossProfit > 10000 && sellerPrice > 0;

  const estimatedTimeline = `${estimatedHoldingMonths} months`;

  const notes = [];
  if (works) {
    notes.push(`Novation profit: ${money(grossProfit)} after all costs.`);
    notes.push(`Seller gets ${money(sellerPrice)} — more than cash (${money(Math.round(arv * 0.70 - repairs))}).`);
    notes.push(`List at ${money(listingPrice)} after ${money(renovationCost)} in renovations.`);
    notes.push(`Timeline: ~${estimatedHoldingMonths} months (rehab + selling).`);
    if (askingPrice && sellerPrice >= askingPrice * 0.85) {
      notes.push('Novation gets closest to seller\'s asking price — use as your final offer if cash and owner finance fail.');
    }
  } else if (sellerPrice <= 0) {
    notes.push('Seller price is negative — repairs are too extensive for novation.');
  } else {
    notes.push(`Only ${money(grossProfit)} profit after costs — not enough margin for the risk and timeline.`);
    notes.push('Need to negotiate seller price lower or find ways to reduce renovation costs.');
  }

  return {
    strategy: 'Novation',
    seller_price: sellerPrice,
    renovation_cost: renovationCost,
    listing_price: listingPrice,
    agent_commission: agentCommission,
    closing_costs: closingCosts,
    holding_costs: totalHoldingCosts,
    holding_costs_monthly: holdingCostsMonthly,
    estimated_holding_months: estimatedHoldingMonths,
    total_costs: totalCosts,
    gross_profit: grossProfit,
    wholesaler_profit: grossProfit,
    estimated_timeline: estimatedTimeline,
    suggested_starting_offer: suggestedStartingOffer,
    asking_price: askingPrice,
    works,
    notes: notes.join(' '),
  };
}

// =============================================================================
// CALCULATE ALL OFFERS
// =============================================================================

export function calculateAllOffers(dealData) {
  const {
    arv,
    repairs,
    asking_price = null,
    property = {},
    market_rent = null,
  } = dealData;

  const cash = calculateCashOffer(arv, repairs, asking_price);
  const ownerFinance = calculateOwnerFinance(arv, repairs, asking_price, property, market_rent);
  const novation = calculateNovation(arv, repairs, asking_price);

  const offers = [cash, ownerFinance, novation];

  // Rank by wholesaler profit
  const profitRanked = [...offers].sort((a, b) => {
    const profitA = a.strategy === 'Cash Offer' ? a.assignment_fee.target
      : a.strategy === 'Owner Finance' ? a.assignment_fee
      : a.wholesaler_profit;
    const profitB = b.strategy === 'Cash Offer' ? b.assignment_fee.target
      : b.strategy === 'Owner Finance' ? b.assignment_fee
      : b.wholesaler_profit;
    return profitB - profitA;
  });

  // Determine best overall strategy
  let bestStrategy;
  let strategyReasoning;

  if (cash.works && cash.spread != null && cash.spread > 15000) {
    bestStrategy = 'Cash Offer';
    strategyReasoning = `Cash offer is strongest: ${money(cash.spread)} spread, ${money(cash.buyer_profit_at_mao)} buyer profit. Fast close, clean deal.`;
  } else if (cash.works && ownerFinance.works) {
    bestStrategy = 'Cash Offer';
    strategyReasoning = `Lead with cash at ${money(cash.suggested_starting_offer)}, pivot to owner finance if rejected. Both strategies work.`;
  } else if (ownerFinance.works && !cash.works) {
    bestStrategy = 'Owner Finance';
    strategyReasoning = `Cash doesn't work at asking, but owner finance gives ${money(ownerFinance.monthly_cashflow)}/mo cash flow. Seller gets more total.`;
  } else if (novation.works && !cash.works && !ownerFinance.works) {
    bestStrategy = 'Novation';
    strategyReasoning = `Cash and owner finance don't work. Novation gives ${money(novation.wholesaler_profit)} profit but takes ~${novation.estimated_timeline}.`;
  } else if (novation.works) {
    bestStrategy = 'Novation';
    strategyReasoning = `Novation gives the highest profit (${money(novation.wholesaler_profit)}) but requires capital and time.`;
  } else {
    bestStrategy = 'Pass';
    strategyReasoning = 'None of the three strategies produce acceptable returns. Walk away or drastically renegotiate.';
  }

  // Negotiation tips specific to this deal
  const negotiationTips = [];
  if (asking_price) {
    if (cash.spread != null && cash.spread < 0) {
      negotiationTips.push(`Asking is ${money(asking_price)}, ${money(Math.abs(cash.spread))} above MAO. Seller needs to come down significantly for cash.`);
    }
    if (ownerFinance.purchase_price > cash.mao) {
      negotiationTips.push(`Owner finance at ${money(ownerFinance.purchase_price)} is ${money(ownerFinance.purchase_price - cash.mao)} more than cash — use this to show seller they get more with terms.`);
    }
    if (novation.seller_price > cash.mao) {
      negotiationTips.push(`Novation nets seller ${money(novation.seller_price)} — highest of all three. Use as final offer if other strategies fail.`);
    }
  }
  negotiationTips.push('Always lead with cash — it\'s the fastest close and simplest deal.');
  negotiationTips.push('Never negotiate against yourself. Make your offer and wait.');
  negotiationTips.push('Have all three offers prepared before the conversation.');

  return {
    cash,
    owner_finance: ownerFinance,
    novation,
    offers,
    profit_ranked: profitRanked,
    best_strategy: bestStrategy,
    strategy_reasoning: strategyReasoning,
    negotiation_tips: negotiationTips,
  };
}

// =============================================================================
// NEGOTIATION GUIDE
// =============================================================================

export function generateNegotiationGuide(allOffers, askingPrice = null) {
  const { cash, owner_finance, novation } = allOffers;

  const opening = askingPrice
    ? `"Based on comparable sales and ${money(cash.mao + cash.buyer_profit_at_mao - cash.mao)} in needed repairs, I can offer ${money(cash.suggested_starting_offer)} cash with a quick close. Here's the breakdown: ARV of the property after renovation is around ${money(cash.mao + cash.buyer_profit_at_mao + (cash.mao - cash.suggested_starting_offer))}, minus repairs, at the standard 70% investor rule."`
    : `"I've run the comps and repair estimates. The property needs about ${money(cash.mao - cash.suggested_starting_offer + cash.buyer_profit_at_mao)} in work. I can offer ${money(cash.suggested_starting_offer)} cash, close in 2-3 weeks. No inspections, no financing contingencies."`;

  const ifRejected = owner_finance.works
    ? `"I understand that feels low. What if we structured this differently? I could offer ${money(owner_finance.purchase_price)} with ${money(owner_finance.down_payment)} down and monthly payments of ${money(owner_finance.monthly_payment)} at ${pct(owner_finance.interest_rate)}. Over ${owner_finance.term_years} years, you'd receive ${money(owner_finance.total_seller_receives)} total — that's ${money(owner_finance.total_interest_to_seller)} more than a cash sale."`
    : `"I understand. Let me see if I can make the numbers work differently. What's the minimum you'd accept for a quick, hassle-free cash close?"`;

  const ifStillRejected = novation.works
    ? `"What if I could get you ${money(novation.seller_price)}? I have a program where we renovate the property, list it at full market value of ${money(novation.listing_price)}, and you get a guaranteed ${money(novation.seller_price)}. It takes about ${novation.estimated_timeline} but you'd net significantly more than a discounted cash sale."`
    : `"What price did you have in mind? I want to find something that works for both of us. If we can't meet on price, maybe we can get creative with the terms."`;

  const walkAway = `"My absolute maximum on a cash offer is ${money(cash.walk_away_price)}. Above that, the numbers don't work for my buyers and I'd be setting everyone up for a loss. I want this to be a win-win."`;

  const keyPoints = [
    'Never negotiate against yourself — make your offer and wait for a response.',
    'Always have three offers ready: cash, owner finance, and novation.',
    'Lead with cash — it\'s the fastest and simplest for the seller.',
    'If cash doesn\'t work, owner finance gives the seller more total money.',
    'Novation is the highest total to seller but takes the longest.',
    'Silence is powerful — after making an offer, stop talking.',
    'Focus on the seller\'s motivation, not just the price.',
    'Every "no" is a chance to present a different structure.',
  ];

  return {
    opening,
    if_rejected: ifRejected,
    if_still_rejected: ifStillRejected,
    walk_away: walkAway,
    key_points: keyPoints,
  };
}
