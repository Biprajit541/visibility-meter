import type { Run, Sample, Sentiment } from "./types";

export const SERIES_SLOTS = 5;

export const brandsOf = (run: Run): string[] => [run.brand, ...run.competitors];

/** Colour follows the entity (its position in [brand, ...competitors]), never its rank.
 *  Five brand colours are validated (none green or red, which mean positive and negative here). Past the fifth brand the remainder shares neutral grey; names are always printed beside the colour. */
export const colorFor = (index: number): string => (index < SERIES_SLOTS ? `var(--b${index + 1})` : "var(--muted)");

export interface Mention { brand: string; sentiment: Sentiment; quote: string }

function isMention(m: unknown): m is Mention {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  return typeof r.brand === "string" && typeof r.quote === "string" &&
    (r.sentiment === "positive" || r.sentiment === "neutral" || r.sentiment === "negative");
}

export function mentionsOf(sample: Sample): Mention[] {
  const ex = sample.extraction as { mentions?: unknown } | null;
  if (!ex || !Array.isArray(ex.mentions)) return [];
  return ex.mentions.filter(isMention);
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const fmtPos = (x: number | null): string => (x == null ? "not named" : Number.isInteger(x) ? String(x) : x.toFixed(2));

export function sampleCounts(run: Run) {
  const valid = run.samples.filter((s) => s.status === "VALID").length;
  const invalid = run.samples.filter((s) => s.status === "INVALID").length;
  const failed = run.samples.filter((s) => s.status === "QUERY_FAILED").length;
  return { valid, invalid, failed, total: run.samples.length };
}

/** Brand(s) with the highest mention rate (ties returned together). */
export function leaders(run: Run): { names: string[]; rate: number } | null {
  if (!run.score || run.score.brands.length === 0) return null;
  const top = Math.max(...run.score.brands.map((b) => b.mention_rate));
  return { names: run.score.brands.filter((b) => b.mention_rate === top).map((b) => b.brand), rate: top };
}

/** One factual sentence, built from the code-computed score. */
export function headline(run: Run): string {
  if (!run.score) return "The pipeline refused to publish a number for this run.";
  const me = run.score.brands[0];
  const n = Math.round(me.mention_rate * run.score.valid_samples);
  const base = `${me.brand} is named in ${n} of ${run.score.valid_samples} valid answers (${pct(me.mention_rate)}).`;
  return me.mean_position == null ? base : `${base} When it appears, its average position is ${fmtPos(me.mean_position)}.`;
}

/** Display only: hides markdown emphasis markers so text reads cleanly. Comparisons use the untouched text. */
export const stripMarkup = (s: string): string => s.replace(/\*\*|__|`/g, "");
