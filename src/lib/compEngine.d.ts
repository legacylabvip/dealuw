/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Adjustment {
  type: string;
  amount: number;
  reason: string;
}

export interface FilteredComp {
  [key: string]: any;
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
  same_subdivision: boolean;
  crosses_major_road: boolean;
  disqualified: boolean;
  disqualified_reasons: string[];
  warnings: string[];
  force_include?: boolean;
  different_subdivision?: boolean;
}

export interface AdjustedComp extends FilteredComp {
  adjusted_price: number;
  adjustments: Adjustment[];
  price_per_sqft: number;
  total_adjustment: number;
}

export interface ARVResult {
  arv: number;
  confidence: string;
  confidence_reasoning: string;
  method: string;
  comps_used: {
    address: string;
    sale_price: number;
    adjusted_price: number;
    days_old: number;
    adjustments: Adjustment[];
  }[];
  adjustments_summary: (Adjustment & { comp_address: string })[];
  warnings: string[];
}

export interface MAOBreakdown {
  arv: number;
  arv_times_70: number;
  repair_estimate: number;
  mao: number;
  formula: string;
  asking_price?: number;
  spread?: number;
  purchase_price?: number;
  assignment_fee?: number;
  recommendation_reasoning: string;
}

export interface MAOResult {
  mao: number;
  spread: number | null;
  assignment_fee: number | null;
  recommendation: string;
  confidence: string;
  breakdown: MAOBreakdown;
}

export function filterComps(
  subject: any,
  rawComps: any[],
  referenceDate?: Date
): { qualified: FilteredComp[]; disqualified: FilteredComp[] };

export function adjustComps(
  subject: any,
  qualifiedComps: any[],
  estimatedArv?: number | null
): AdjustedComp[];

export function calculateARV(
  subject: any,
  adjustedComps: AdjustedComp[]
): ARVResult;

export function calculateMAO(
  arv: number,
  repairEstimate: number,
  askingPrice?: number | null,
  purchasePrice?: number | null,
  confidence?: string
): MAOResult;
