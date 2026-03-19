/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AssignmentFeeRange {
  conservative: number;
  target: number;
  aggressive: number;
}

export interface CashOffer {
  strategy: 'Cash Offer';
  mao: number;
  suggested_starting_offer: number;
  walk_away_price: number;
  assignment_fee: AssignmentFeeRange;
  buyer_profit_at_mao: number;
  buyer_roi: number;
  spread: number | null;
  asking_price: number | null;
  works: boolean;
  notes: string;
}

export interface OwnerFinanceStartingOffer {
  price: number;
  down_payment: number;
  interest_rate: number;
  term: number;
}

export interface OwnerFinanceOffer {
  strategy: 'Owner Finance';
  purchase_price: number;
  down_payment: number;
  down_payment_pct: number;
  financed_amount: number;
  interest_rate: number;
  term_years: number;
  monthly_payment: number;
  market_rent: number;
  monthly_cashflow: number;
  annual_cashflow: number;
  assignment_fee: number;
  total_interest_to_seller: number;
  total_seller_receives: number;
  suggested_starting_offer: OwnerFinanceStartingOffer;
  asking_price: number | null;
  works: boolean;
  notes: string;
}

export interface NovationStartingOffer {
  seller_price: number;
  profit_split: string;
  renovation_timeline: string;
  listing_timeline: string;
}

export interface NovationOffer {
  strategy: 'Novation';
  seller_price: number;
  renovation_cost: number;
  listing_price: number;
  agent_commission: number;
  closing_costs: number;
  holding_costs: number;
  holding_costs_monthly: number;
  estimated_holding_months: number;
  total_costs: number;
  gross_profit: number;
  wholesaler_profit: number;
  estimated_timeline: string;
  suggested_starting_offer: NovationStartingOffer;
  asking_price: number | null;
  works: boolean;
  notes: string;
}

export type AnyOffer = CashOffer | OwnerFinanceOffer | NovationOffer;

export interface AllOffers {
  cash: CashOffer;
  owner_finance: OwnerFinanceOffer;
  novation: NovationOffer;
  offers: AnyOffer[];
  profit_ranked: AnyOffer[];
  best_strategy: string;
  strategy_reasoning: string;
  negotiation_tips: string[];
}

export interface NegotiationGuide {
  opening: string;
  if_rejected: string;
  if_still_rejected: string;
  walk_away: string;
  key_points: string[];
}

export function calculateCashOffer(arv: number, repairs: number, askingPrice?: number | null): CashOffer;
export function calculateOwnerFinance(arv: number, repairs: number, askingPrice?: number | null, property?: any, marketRent?: number | null): OwnerFinanceOffer;
export function calculateNovation(arv: number, repairs: number, askingPrice?: number | null): NovationOffer;
export function calculateAllOffers(dealData: any): AllOffers;
export function generateNegotiationGuide(allOffers: AllOffers, askingPrice?: number | null): NegotiationGuide;
