// Test file for the DealUW Comp Engine
// Run: node test-comp-engine.mjs

import { filterComps, adjustComps, calculateARV, calculateMAO } from './src/lib/compEngine.js';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const GOLD = '\x1b[33m';
const BLUE = '\x1b[36m';
const RESET = '\x1b[0m';
let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) { console.log(`  ${PASS} ${label}`); passed++; }
  else { console.log(`  ${FAIL} ${label}`); failed++; }
}

function section(title) {
  console.log(`\n${BLUE}=== ${title} ===${RESET}`);
}

function money(n) {
  return '$' + (n != null ? n.toLocaleString() : '0');
}

// ---------------------------------------------------------------------------
// TEST DATA
// ---------------------------------------------------------------------------

const subject = {
  address: '123 Main St',
  beds: 3,
  baths: 2,
  sqft: 1500,
  lot_sqft: 7000,
  year_built: 2005,
  property_type: 'ranch',
  has_pool: false,
  has_garage: false,
  garage_count: 0,
  has_carport: false,
  has_basement: false,
  basement_sqft: 0,
  has_guest_house: false,
  guest_house_sqft: 0,
  traffic_commercial: 'none',
  asking_price: 180000,
};

// Reference date for consistent testing
const refDate = new Date('2026-03-05');

const rawComps = [
  {
    // COMP 1: Perfect comp — same subdivision, close match
    address: '125 Main St',
    sale_price: 260000,
    sale_date: '2026-01-15',
    beds: 3,
    baths: 2,
    sqft: 1480,
    lot_sqft: 7200,
    year_built: 2006,
    property_type: 'ranch',
    distance_miles: 0.1,
    same_subdivision: true,
    crosses_major_road: false,
    has_pool: false,
    has_garage: false,
    garage_count: 0,
    has_carport: false,
    has_basement: false,
    basement_sqft: 0,
    has_guest_house: false,
    guest_house_sqft: 0,
  },
  {
    // COMP 2: Good comp — 4 beds (needs bedroom adjustment), has garage
    address: '200 Oak Ave',
    sale_price: 285000,
    sale_date: '2025-12-20',
    beds: 4,
    baths: 2,
    sqft: 1550,
    lot_sqft: 7500,
    year_built: 2003,
    property_type: 'ranch',
    distance_miles: 0.3,
    same_subdivision: true,
    crosses_major_road: false,
    has_pool: false,
    has_garage: true,
    garage_count: 1,
    has_carport: false,
    has_basement: false,
    basement_sqft: 0,
    has_guest_house: false,
    guest_house_sqft: 0,
  },
  {
    // COMP 3: Aging comp — 160 days old, should get -5% penalty
    address: '310 Elm Dr',
    sale_price: 255000,
    sale_date: '2025-09-27',
    beds: 3,
    baths: 2,
    sqft: 1520,
    lot_sqft: 6800,
    year_built: 2007,
    property_type: 'ranch',
    distance_miles: 0.5,
    same_subdivision: false,
    crosses_major_road: false,
    has_pool: false,
    has_garage: false,
    garage_count: 0,
    has_carport: false,
    has_basement: false,
    basement_sqft: 0,
    has_guest_house: false,
    guest_house_sqft: 0,
  },
  {
    // COMP 4: SHOULD BE DISQUALIFIED — 2-story (type mismatch)
    address: '450 Pine Rd',
    sale_price: 310000,
    sale_date: '2026-02-01',
    beds: 3,
    baths: 2.5,
    sqft: 1600,
    lot_sqft: 7000,
    year_built: 2004,
    property_type: '2-story',
    distance_miles: 0.4,
    same_subdivision: true,
    crosses_major_road: false,
    has_pool: true,
    has_garage: true,
    garage_count: 2,
    has_carport: false,
    has_basement: false,
    basement_sqft: 0,
    has_guest_house: false,
    guest_house_sqft: 0,
  },
  {
    // COMP 5: SHOULD BE DISQUALIFIED — crosses major road
    address: '500 Highway Blvd',
    sale_price: 240000,
    sale_date: '2026-01-10',
    beds: 3,
    baths: 2,
    sqft: 1450,
    lot_sqft: 6900,
    year_built: 2005,
    property_type: 'ranch',
    distance_miles: 0.8,
    same_subdivision: false,
    crosses_major_road: true,
    has_pool: false,
    has_garage: false,
    garage_count: 0,
    has_carport: false,
    has_basement: false,
    basement_sqft: 0,
    has_guest_house: false,
    guest_house_sqft: 0,
  },
];

// ---------------------------------------------------------------------------
// STEP 1 — FILTER COMPS
// ---------------------------------------------------------------------------

section('STEP 1: Filter Comps');

const { qualified, disqualified } = filterComps(subject, rawComps, refDate);

console.log(`  Qualified: ${qualified.length}, Disqualified: ${disqualified.length}`);

assert('3 comps qualify', qualified.length === 3);
assert('2 comps disqualified', disqualified.length === 2);

// Check DQ reasons
const dqAddresses = disqualified.map(c => c.address);
assert('450 Pine Rd disqualified (type mismatch)', dqAddresses.includes('450 Pine Rd'));
assert('500 Highway Blvd disqualified (crosses road)', dqAddresses.includes('500 Highway Blvd'));

const pineComp = disqualified.find(c => c.address === '450 Pine Rd');
assert('Pine Rd reason includes "Type mismatch"', pineComp.disqualified_reasons.some(r => r.includes('Type mismatch')));

const hwyComp = disqualified.find(c => c.address === '500 Highway Blvd');
assert('Highway Blvd reason includes "Crosses major road"', hwyComp.disqualified_reasons.some(r => r.includes('Crosses major road')));

// Check sort order: same_subdivision first
assert('Same subdivision comps sorted first', qualified[0].same_subdivision === true);

// Check that the aging comp (Elm Dr) has a subdivision warning
const elmComp = qualified.find(c => c.address === '310 Elm Dr');
assert('Elm Dr flagged as different subdivision', elmComp && elmComp.warnings.length > 0);

console.log('\n  Qualified comps (sorted):');
for (const c of qualified) {
  console.log(`    ${c.address} | ${c.days_old}d old | subdiv: ${c.same_subdivision} | dist: ${c.distance_miles}mi`);
}
console.log('  Disqualified comps:');
for (const c of disqualified) {
  console.log(`    ${c.address} | Reasons: ${c.disqualified_reasons.join('; ')}`);
}

// ---------------------------------------------------------------------------
// STEP 2 — ADJUST COMPS
// ---------------------------------------------------------------------------

section('STEP 2: Adjust Comps');

const adjusted = adjustComps(subject, qualified);

for (const c of adjusted) {
  console.log(`\n  ${GOLD}${c.address}${RESET}`);
  console.log(`    Sale price: ${money(c.sale_price)} → Adjusted: ${money(c.adjusted_price)}`);
  console.log(`    Total adjustment: ${money(c.total_adjustment)}`);
  console.log(`    $/sqft: $${c.price_per_sqft}`);
  for (const a of c.adjustments) {
    console.log(`    - ${a.reason}`);
  }
}

// Comp 1 (125 Main): identical to subject, no feature adjustments, not aging → should be unchanged
const comp1 = adjusted.find(c => c.address === '125 Main St');
assert('125 Main St: no feature adjustments (identical)', comp1.adjustments.filter(a => a.amount !== 0).length === 0);
assert('125 Main St: adjusted_price = sale_price', comp1.adjusted_price === comp1.sale_price);

// Comp 2 (200 Oak): has 4 beds (subject has 3) → subtract 1 bedroom adj, has garage (subject doesn't) → subtract garage
const comp2 = adjusted.find(c => c.address === '200 Oak Ave');
const comp2BedroomAdj = comp2.adjustments.find(a => a.type === 'bedroom');
assert('200 Oak: bedroom adjustment applied', comp2BedroomAdj != null);
assert('200 Oak: bedroom adj is negative (comp has more beds)', comp2BedroomAdj.amount < 0);
// Under 200k estimated → $10K per bed. Subject 3 - Comp 4 = -1 bed diff → -$10,000
// But avg price ~267K so mid tier → -$15K
assert('200 Oak: bedroom adj = -$15,000 (mid tier)', comp2BedroomAdj.amount === -15000);

const comp2GarageAdj = comp2.adjustments.find(a => a.type === 'garage');
assert('200 Oak: garage adjustment applied', comp2GarageAdj != null);
assert('200 Oak: garage adj is -$10,000 (comp has, subject doesn\'t)', comp2GarageAdj.amount === -10000);

// Comp 2 expected: 285000 - 15000 (bed) - 10000 (garage) = 260000
assert('200 Oak: adjusted = $260,000', comp2.adjusted_price === 260000);

// Comp 3 (310 Elm): 160 days old → should get -5% aging penalty
const comp3 = adjusted.find(c => c.address === '310 Elm Dr');
const comp3AgingAdj = comp3.adjustments.find(a => a.type === 'aging_penalty');
assert('310 Elm: aging penalty applied (160 days)', comp3AgingAdj != null);
// 255000 * -0.05 = -12750 → adjusted = 242250
assert('310 Elm: adjusted = $242,250 (after -5%)', comp3.adjusted_price === 242250);

// ---------------------------------------------------------------------------
// STEP 3 — CALCULATE ARV
// ---------------------------------------------------------------------------

section('STEP 3: Calculate ARV');

const arvResult = calculateARV(subject, adjusted);

console.log(`  ARV: ${GOLD}${money(arvResult.arv)}${RESET}`);
console.log(`  Confidence: ${arvResult.confidence}`);
console.log(`  Reasoning: ${arvResult.confidence_reasoning}`);
console.log(`  Method: ${arvResult.method}`);
if (arvResult.warnings.length > 0) {
  console.log('  Warnings:');
  for (const w of arvResult.warnings) {
    console.log(`    - ${w}`);
  }
}

// Median of [260000, 260000, 242250] = 260000 (sorted: 242250, 260000, 260000 → middle = 260000)
// Subject sqft = 1500, median comp sqft = 1500 (median of [1480, 1550, 1520] = 1520)
// Normalized: 260000 * (1500 / 1520) = 256579 (approx)
assert('ARV is calculated and > 0', arvResult.arv > 0);
assert('ARV uses median method', arvResult.method.includes('Median'));
assert('3 comps used', arvResult.comps_used.length === 3);
assert('Confidence is low (has aging comp 159 days old)', arvResult.confidence === 'low');

console.log('\n  Comps used:');
for (const c of arvResult.comps_used) {
  console.log(`    ${c.address}: sale ${money(c.sale_price)} → adjusted ${money(c.adjusted_price)}`);
}

// ---------------------------------------------------------------------------
// STEP 4 — CALCULATE MAO
// ---------------------------------------------------------------------------

section('STEP 4: Calculate MAO');

const repairEstimate = 1500 * 25; // fair condition, $25/sqft = $37,500
const maoResult = calculateMAO(arvResult.arv, repairEstimate, subject.asking_price, null, arvResult.confidence);

console.log(`  Repair Estimate: ${money(repairEstimate)}`);
console.log(`  MAO: ${GOLD}${money(maoResult.mao)}${RESET}`);
console.log(`  Spread: ${money(maoResult.spread)}`);
console.log(`  Recommendation: ${maoResult.recommendation.toUpperCase()}`);
console.log(`  Formula: ${maoResult.breakdown.formula}`);
console.log(`  Reasoning: ${maoResult.breakdown.recommendation_reasoning}`);

// MAO = (ARV * 0.70) - 37500
const expectedMao = Math.round(arvResult.arv * 0.70) - repairEstimate;
assert(`MAO formula correct: ${money(maoResult.mao)}`, maoResult.mao === expectedMao);
assert('Spread = MAO - asking', maoResult.spread === maoResult.mao - subject.asking_price);

// With ARV ~256K, MAO = 256K * 0.70 - 37500 = 179200 - 37500 = 141700ish
// Spread = 141700 - 180000 = -38300 → negative → should be PASS
// Actually let's just check the logic
if (maoResult.spread < 0) {
  assert('Negative spread → recommendation is PASS', maoResult.recommendation === 'pass');
} else if (maoResult.spread > 15000) {
  assert('Large spread → recommendation is GO', maoResult.recommendation === 'go');
} else {
  assert('Moderate spread → recommendation is NEGOTIATE', maoResult.recommendation === 'negotiate');
}

// ---------------------------------------------------------------------------
// EDGE CASE: Test with basement/guest house subject
// ---------------------------------------------------------------------------

section('EDGE CASE: Basement/Guest House 50% Rule');

const subjectWithBasement = {
  ...subject,
  has_basement: true,
  basement_sqft: 800,
};

// effectiveSqft = 1500 + (800 * 0.50) = 1900
const arvWithBasement = calculateARV(subjectWithBasement, adjusted);
console.log(`  Subject effective sqft: 1500 + (800 * 50%) = 1900`);
console.log(`  ARV with basement: ${GOLD}${money(arvWithBasement.arv)}${RESET}`);
assert('Basement increases ARV (more effective sqft)', arvWithBasement.arv > arvResult.arv);

// ---------------------------------------------------------------------------
// EDGE CASE: Traffic/commercial subject
// ---------------------------------------------------------------------------

section('EDGE CASE: Traffic/Commercial Adjustment');

const subjectFronting = {
  ...subject,
  traffic_commercial: 'fronting',
};

const arvFronting = calculateARV(subjectFronting, adjusted);
console.log(`  ARV with fronting: ${GOLD}${money(arvFronting.arv)}${RESET} (was ${money(arvResult.arv)} without)`);
assert('Fronting reduces ARV', arvFronting.arv < arvResult.arv);
assert('Fronting warning present', arvFronting.warnings.some(w => w.includes('fronting')));

// Under $500K → -$15K default for fronting
const expectedFrontingReduction = 15000;
const actualReduction = arvResult.arv - arvFronting.arv;
assert(`Fronting reduces by ~$${expectedFrontingReduction.toLocaleString()} (got $${actualReduction.toLocaleString()})`,
  Math.abs(actualReduction - expectedFrontingReduction) < 2);

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------

section('RESULTS');
console.log(`  ${GOLD}Total: ${passed + failed} tests${RESET}`);
console.log(`  ${passed > 0 ? '\x1b[32m' : ''}Passed: ${passed}${RESET}`);
console.log(`  ${failed > 0 ? '\x1b[31m' : ''}Failed: ${failed}${RESET}`);

if (failed > 0) process.exit(1);
