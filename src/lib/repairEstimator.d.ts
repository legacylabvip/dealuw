/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RepairLineItem {
  category: string;
  description: string;
  estimate_low: number;
  estimate_high: number;
  recommended: number;
  urgency: 'high' | 'medium' | 'low';
}

export interface RepairEstimate {
  mode: 'ai_photo' | 'algorithmic' | 'manual';
  overall_condition: string;
  confidence: 'high' | 'medium' | 'low';
  line_items: RepairLineItem[];
  total_low: number;
  total_high: number;
  total_recommended: number;
  notes: string;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
}

export const CATEGORIES: string[];
export const CATEGORY_LABELS: Record<string, string>;
export const CATEGORY_MAXES: Record<string, number>;

export function estimateFromPhotos(property: any, photoDataUrls: string[]): Promise<RepairEstimate>;
export function algorithmicEstimate(property: any): RepairEstimate;
