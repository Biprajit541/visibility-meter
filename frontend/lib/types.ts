// Mirrors backend app/schemas.py (SCHEMA_VERSION 1.0.0). Change both together.
export type Sentiment = "positive" | "neutral" | "negative";
export type RunStatus = "SCORED" | "HALTED";
export type SampleStatus = "VALID" | "INVALID" | "QUERY_FAILED";

export interface HaltReason { code: string; detail: string }
export interface BrandScore {
  brand: string;
  mention_rate: number;
  mean_position: number | null;
  sentiment: Record<Sentiment, number>;
}
export interface Score { valid_samples: number; brands: BrandScore[] }
export interface Sample {
  prompt: string;
  status: SampleStatus;
  raw_response: string | null;
  extraction: unknown;
  reasons: string[];
  attempts: number;
}
export interface Run {
  id: string;
  schema_version: string;
  brand: string;
  competitors: string[];
  status: RunStatus;
  halt_reasons: HaltReason[];
  score: Score | null;
  samples: Sample[];
}
export interface OutcomeRow { brand: string; status: SampleStatus; samples: number; avg_attempts: number }
export interface RejectionRow { code: string; count: number }
export interface Stats { outcomes: OutcomeRow[]; rejections: RejectionRow[] }
export interface RunRequest { brand: string; competitors: string[]; prompts: string[] }
