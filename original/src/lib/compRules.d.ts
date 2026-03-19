export const COMP_RULES: {
  maxAge: number;
  agingThreshold: number;
  agingWarningThreshold: number;
  agingPenalty: number;
  maxSqftDifference: number;
  maxYearBuiltDifference: number;
  maxLotSqftDifference: number;
  basementGuestHouseMultiplier: number;
  maoMultiplier: number;
};

export const ADJUSTMENTS: {
  bedroom: { under200k: number; mid: number; over400k: number };
  bathroom: number;
  garage: number;
  carport: number;
  pool: number;
  traffic: {
    under500k: { siding: number; backing: number; fronting: number };
    over500k: { siding: number; backing: number; fronting: number };
  };
};
