/** Pure helpers behind the price history chart (#946). Dates are ISO "YYYY-MM-DD" strings, read as UTC. */

export type PricePoint = { date: string; price: number };

export type HistoryRange = { id: string; label: string; months: number | null };

export const HISTORY_RANGES: HistoryRange[] = [
  { id: "1m", label: "1M", months: 1 },
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
  { id: "1y", label: "1Y", months: 12 },
  { id: "3y", label: "3Y", months: 36 },
  { id: "max", label: "Max", months: null },
];
export const DEFAULT_RANGE_ID = "3m";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

export function toPoints(raw: [string, number][]): PricePoint[] {
  return raw.map(([date, price]) => ({ date, price }));
}

export function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** `iso` minus whole calendar months, with the day clamped to the target month's length (Mar 31 - 1 month = Feb 28). */
export function minusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const index = y * 12 + (m - 1) - months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The points inside a range, counted back from the latest point. A point exactly on the cut-off day is kept. */
export function pointsInRange(points: PricePoint[], range: HistoryRange): PricePoint[] {
  if (range.months == null || points.length === 0) return points;
  const cutoff = minusMonths(points[points.length - 1].date, range.months);
  return points.filter((p) => p.date >= cutoff);
}

/** Percent change first to last point; null when there are fewer than two points or the start was 0. */
export function rangeChangePct(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].price;
  if (first <= 0) return null;
  return ((points[points.length - 1].price - first) / first) * 100;
}

export type HistoryStats = {
  now: number | null;
  peak: PricePoint | null;
  /** Lowest price from the peak day on, today's price included. */
  lowSincePeak: number | null;
  /** Today's price against the peak, percent (negative when below it). */
  changeFromPeakPct: number | null;
};

/** Stats over the whole history. `current` is the price now; without it the last point stands in. */
export function historyStats(points: PricePoint[], current: number | null): HistoryStats {
  const now = current ?? (points.length ? points[points.length - 1].price : null);
  if (points.length === 0) return { now, peak: null, lowSincePeak: null, changeFromPeakPct: null };
  let peakIndex = 0;
  points.forEach((p, i) => {
    if (p.price > points[peakIndex].price) peakIndex = i;
  });
  const peak = points[peakIndex];
  const after = points.slice(peakIndex).map((p) => p.price);
  const low = Math.min(...after, ...(now != null ? [now] : []));
  return {
    now,
    peak,
    lowSincePeak: low,
    changeFromPeakPct: now != null && peak.price > 0 ? ((now - peak.price) / peak.price) * 100 : null,
  };
}

/** "12 days ago", "5 months ago": days up to two months, then whole months. */
export function releasedAgo(released: string, today: string): string {
  const days = dayNumber(today) - dayNumber(released);
  if (days < 0) return "upcoming";
  if (days === 0) return "today";
  if (days < 61) return days === 1 ? "1 day ago" : `${days} days ago`;
  const [ry, rm, rd] = released.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - ry) * 12 + (tm - rm) - (td < rd ? 1 : 0);
  return `${months} months ago`;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "Round" axis ticks covering [min, max]: 3 to 4 values, evenly spaced on 1/2/5 steps. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) {
    const v = Number.isFinite(min) ? min : 0;
    return [Math.max(0, v - 1), v, v + 1].map((x) => Math.round(x * 100) / 100);
  }
  const raw = (max - min) / Math.max(1, target - 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v < max + step - 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Index of the point whose date is closest to day number `x` (points are oldest first). */
export function nearestIndex(points: PricePoint[], x: number): number {
  let best = 0;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const dist = Math.abs(dayNumber(p.date) - x);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

/** The card's name without its art marks: "Monkey.D.Luffy (Alternate Art)" gives "Monkey.D.Luffy". */
export function baseCardName(productName: string): string {
  return productName.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || productName;
}

/** The art marks of a TCGPlayer product name ("Alternate Art", "Manga"), or "base art" when it has none. */
export function artLabel(productName: string): string {
  const marks = [...productName.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return marks.length ? marks.join(", ") : "base art";
}

/** The question the "Ask Log Pose" button sends. The art and product id let Log Pose price the exact art. */
export function buyQuestion(productName: string, cardId: string, productId: number): string {
  return `When is the best time to buy ${baseCardName(productName)} (${artLabel(productName)}, ${cardId}${productId ? `, product ${productId}` : ""})? Use its price history and how much it's being played.`;
}
