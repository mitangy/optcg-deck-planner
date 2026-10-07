/** Aggregation for the eval report: per-case means over reps, per-group scores, Wilson intervals and paired deltas. */
import type { Row } from "./types";

/** 95% Wilson interval for k successes in n trials (fractions, not percent). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export type Metric = "correct" | "cited" | "grounded" | "rubric";

/** Each case's mean over its scored reps (status ok); cases with no scored rep are left out. */
export function caseMeans(rows: readonly Row[], metric: Metric): Map<string, number> {
  const byCase = new Map<string, number[]>();
  for (const r of rows) {
    const v = r.status === "ok" ? r.grade?.[metric] : undefined;
    if (v === undefined) continue;
    byCase.set(r.case, [...(byCase.get(r.case) ?? []), v]);
  }
  return new Map([...byCase].map(([id, vs]) => [id, vs.reduce((s, v) => s + v, 0) / vs.length]));
}

export const mean = (xs: Iterable<number>) => {
  const a = [...xs];
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
};

/** The score of a set of cases: mean of per-case means, with how many cases counted. */
export function score(rows: readonly Row[], metric: Metric): { n: number; mean: number; sum: number } {
  const m = caseMeans(rows, metric);
  const sum = [...m.values()].reduce((s, v) => s + v, 0);
  return { n: m.size, mean: m.size ? sum / m.size : 0, sum };
}

// Two-sided 95% t critical values for 1..30 degrees of freedom.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const tCrit = (df: number) => (df < 1 ? Infinity : df <= 30 ? T95[df - 1]! : 1.96);

/** Mean of per-case differences (b minus a) over the cases both have, with a t interval. */
export function pairedDelta(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): { n: number; mean: number; lo: number; hi: number } {
  const diffs = [...b].filter(([id]) => a.has(id)).map(([id, v]) => v - a.get(id)!);
  const n = diffs.length;
  const m = mean(diffs);
  if (n < 2) return { n, mean: m, lo: n ? m : 0, hi: n ? m : 0 };
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1));
  const half = (tCrit(n - 1) * sd) / Math.sqrt(n);
  return { n, mean: m, lo: m - half, hi: m + half };
}

/** Cases whose mean moved by `by` or more between two runs. */
export function flipped(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, by = 0.5): { id: string; from: number; to: number }[] {
  return [...b]
    .filter(([id, v]) => a.has(id) && Math.abs(v - a.get(id)!) >= by - 1e-9)
    .map(([id, v]) => ({ id, from: a.get(id)!, to: v }))
    .sort((x, y) => x.id.localeCompare(y.id));
}
