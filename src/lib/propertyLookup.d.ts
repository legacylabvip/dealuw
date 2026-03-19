/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PropertyData {
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  property_type: string;
  stories: number | null;
  has_pool: boolean;
  has_garage: boolean;
  garage_count: number;
  has_carport: boolean;
  has_basement: boolean;
  basement_sqft: number;
  has_guest_house: boolean;
  guest_house_sqft: number;
  tax_assessed_value: number | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  zoning: string | null;
  subdivision: string | null;
  latitude: number | null;
  longitude: number | null;
  raw_data: any;
}

export interface LookupResult {
  available: boolean;
  property?: PropertyData;
  error?: string;
}

export interface CompResult {
  available: boolean;
  comps: any[];
  expansions: string[];
  low_confidence?: boolean;
  provider?: string;
  error?: string;
}

export function isAutoLookupAvailable(): boolean;
export function getProviderName(): string | null;
export function lookupProperty(address: string, city: string, state: string, zip: string): Promise<LookupResult>;
export function pullComps(property: any, options?: any): Promise<CompResult>;
