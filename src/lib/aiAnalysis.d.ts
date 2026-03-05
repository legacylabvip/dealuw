export interface AIAnalysisPoint {
  number: number;
  text: string;
}

export interface AIAnalysisResult {
  points: AIAnalysisPoint[];
  rawText: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export function analyzeWithAI(dealData: any): Promise<AIAnalysisResult>;
