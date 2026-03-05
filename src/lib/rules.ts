export const COMP_RULES = {
  maxAgeDays: 180,
  sqftRange: 250,
  lotSqftRange: 2500,
  yearBuiltRange: 10,
  sameSubdivisionPreferred: true,
  samePropertyType: true,
  noCrossMajorRoads: true,
  staleCompPenalty: { min: 0.10, max: 0.20 },
};

export const ADJUSTMENT_RULES = {
  bedroom: { min: 10000, max: 25000 },
  bathroom: 10000,
  garage: 10000,
  carport: 5000,
  pool: 10000,
};

export const TRAFFIC_COMMERCIAL_RULES = {
  under500k: {
    siding: -10000,
    backing: -10000,
    fronting: { min: -10000, max: -20000 },
  },
  over500k: {
    siding: -0.10,
    backing: -0.15,
    fronting: -0.20,
  },
};

export const BASEMENT_GUEST_HOUSE_RULE = {
  valueMultiplier: 0.50,
};

export const MAO_FORMULA = {
  arvMultiplier: 0.70,
  description: 'MAO = (ARV x 0.70) - Repair Estimate',
};

export function getAllRules() {
  return {
    compRules: COMP_RULES,
    adjustmentRules: ADJUSTMENT_RULES,
    trafficCommercialRules: TRAFFIC_COMMERCIAL_RULES,
    basementGuestHouseRule: BASEMENT_GUEST_HOUSE_RULE,
    maoFormula: MAO_FORMULA,
  };
}
