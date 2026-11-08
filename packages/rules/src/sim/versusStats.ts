/** Statistics of a paired bot-vs-bot batch (versus.ts). Pure. */

export interface PairRow { g: number; winner: "a" | "b" | null }

/** 95% Wilson interval of k successes in n trials. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

/**
 * Games g = 2k and 2k + 1 are one pair: the same deals with the bots' seats swapped. Each pair with both games finished scores A
 * 1 (won both), 0.5 (split) or 0 (lost both). `pairedCi` is the normal-approximation 95% interval of the mean pair score, which is
 * A's win rate with the deal-luck cancelled; it is narrower than the Wilson interval over single games when the deals decide a lot.
 */
export function pairedStats(rows: readonly PairRow[]): { aBoth: number; split: number; bBoth: number; pairedRate: number; pairedCi: [number, number] } {
  const byPair = new Map<number, PairRow[]>();
  for (const r of rows) {
    const k = Math.floor(r.g / 2);
    byPair.set(k, [...(byPair.get(k) ?? []), r]);
  }
  let aBoth = 0;
  let bBoth = 0;
  let split = 0;
  for (const p of byPair.values()) {
    if (p.length !== 2 || p.some((r) => r.winner === null)) continue;
    const w = p.filter((r) => r.winner === "a").length;
    if (w === 2) aBoth += 1; else if (w === 0) bBoth += 1; else split += 1;
  }
  const n = aBoth + split + bBoth;
  if (!n) return { aBoth, split, bBoth, pairedRate: 0.5, pairedCi: [0, 1] };
  const mean = (aBoth + 0.5 * split) / n;
  const variance = n > 1 ? (aBoth * (1 - mean) ** 2 + split * (0.5 - mean) ** 2 + bBoth * mean ** 2) / (n - 1) : 0;
  const half = 1.96 * Math.sqrt(variance / n);
  return { aBoth, split, bBoth, pairedRate: mean, pairedCi: [mean - half, mean + half] };
}
