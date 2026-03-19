// DealUW Comp Rules — Professional Appraisal Standards
// Used by compEngine.js and displayed on the Rules page

export const COMP_RULES = {
  maxAge: 180,
  agingThreshold: 150,
  agingWarningThreshold: 120,
  agingPenalty: 0.05,
  maxSqftDifference: 250,
  maxYearBuiltDifference: 10,
  maxLotSqftDifference: 2500,
  basementGuestHouseMultiplier: 0.50,
  maoMultiplier: 0.70,
};

export const ADJUSTMENTS = {
  bedroom: { under200k: 10000, mid: 15000, over400k: 25000 },
  bathroom: 10000,
  garage: 10000,
  carport: 5000,
  pool: 10000,
  traffic: {
    under500k: { siding: 10000, backing: 10000, fronting: 15000 },
    over500k: { siding: 0.10, backing: 0.15, fronting: 0.20 },
  },
};
