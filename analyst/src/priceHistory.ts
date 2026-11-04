import { artKind, bestTimeToBuy, buyTiming, expectedRatio, type PricePoint } from "@optcg/price-timing";
import { plannerCall, type PlannerApi } from "./matches";

type Raw = {
  card_id: string;
  product_id: number;
  name: string;
  group_name?: string;
  released: string | null;
  current: number | null;
  points: [string, number][];
};

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const todayIso = () => new Date().toISOString().slice(0, 10);
const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Weeks of history sampled for the model: enough to see the shape, few enough to cite. */
export const SAMPLE_WEEKS = 26;

/** One point a week for the last SAMPLE_WEEKS weeks, counted back from the newest point (which is always kept), oldest first. */
export function weeklySample(points: PricePoint[]): [string, number][] {
  if (!points.length) return [];
  const last = dayNumber(points[points.length - 1]!.date);
  const out: [string, number][] = [];
  for (let w = SAMPLE_WEEKS - 1; w >= 0; w--) {
    const want = last - w * 7;
    // The newest point on or before the wanted day, so a gap in the history never invents a price.
    let pick: PricePoint | undefined;
    for (const p of points) {
      if (dayNumber(p.date) <= want) pick = p;
      else break;
    }
    if (pick && !out.some(([d]) => d === pick!.date)) out.push([pick.date, round2(pick.price)]);
  }
  return out;
}

/** Percent change from the price `days` days before the newest day to `now`; null when the history does not reach back that far. */
export function changeOver(points: PricePoint[], now: number, days: number): number | null {
  if (!points.length) return null;
  const cutoff = dayNumber(points[points.length - 1]!.date) - days;
  let past: PricePoint | undefined;
  for (const p of points) {
    if (dayNumber(p.date) <= cutoff) past = p;
    else break;
  }
  if (!past || !(past.price > 0)) return null;
  return round1(((now - past.price) / past.price) * 100);
}

/** What `price_history` tells Log Pose about one art: the shape of its TCGPlayer market price and a "when to buy" read from past sets. */
export async function priceHistory(api: PlannerApi, q: { card_id: string; product_id?: number }, today: string = todayIso()) {
  const id = q.card_id.trim().toUpperCase();
  const productId = q.product_id && q.product_id > 0 ? Math.floor(q.product_id) : 0;
  const raw = await plannerCall<Raw>(api, null, `/catalog/cards/${encodeURIComponent(id)}/price-history?product_id=${productId}`);
  const points: PricePoint[] = raw.points.map(([date, price]) => ({ date, price }));
  const newest = points.length ? points[points.length - 1]! : null;
  const now = raw.current ?? newest?.price ?? null;
  const kind = artKind(raw.name);
  const age = raw.released ? dayNumber(today) - dayNumber(raw.released) : null;

  let peakIndex = -1;
  for (let i = 0; i < points.length; i++) if (peakIndex < 0 || points[i]!.price > points[peakIndex]!.price) peakIndex = i;
  const peak = peakIndex >= 0 ? points[peakIndex]! : null;
  let low: PricePoint | null = null;
  if (peak) {
    for (const p of points.slice(peakIndex)) if (!low || p.price < low.price) low = p;
    if (now != null && (!low || now < low.price)) low = { date: today, price: now };
  }

  const timing = buyTiming({ kind, released: raw.released, today, points, current: now });
  const best = bestTimeToBuy({ kind, released: raw.released, today, points, current: now });
  const notes = [
    "Prices are TCGPlayer market prices in USD, one per day.",
    ...(raw.released ? [] : ["No release date is known for this set."]),
    ...(points.length ? [] : ["No price history has been recorded for this art yet."]),
    ...(productId === 0 ? ["This is the card's base art. Pass product_id for an alternate art; the Price history panel in the planner names it."] : []),
  ];

  return {
    card_id: raw.card_id,
    product_id: raw.product_id,
    art_name: raw.name,
    set: raw.group_name ?? "",
    released: raw.released,
    age_days: age,
    now: now != null ? round2(now) : null,
    peak: peak ? { price: round2(peak.price), date: peak.date } : null,
    low_since_peak: low ? { price: round2(low.price), date: low.date } : null,
    change_30d_pct: now != null ? changeOver(points, now, 30) : null,
    change_90d_pct: now != null ? changeOver(points, now, 90) : null,
    history_days: points.length,
    weekly_points: weeklySample(points),
    art_kind: kind,
    typical_curve: {
      basis: "Median price as a percent of release-day price for 924 singles from OP06-OP17, EB01-EB05 and PRB-01/02 (2024-02 to 2026-11). A typical pattern of past sets, not a forecast.",
      kind_note:
        kind === "other"
          ? "Art kind unknown (base art or unmatched name), so the all-singles curve is used."
          : kind === "chase"
            ? "Manga, SP, Treasure, Wanted Poster and Gold arts."
            : kind === "alt"
              ? "Alternate (parallel) arts."
              : "Base SR, SEC and Leader cards.",
      percent_of_release_price_at_this_age: age != null && age >= 0 ? round1(expectedRatio(kind, age)) : null,
      percent_of_release_price_at_6_months: round1(expectedRatio(kind, 180)),
    },
    buy_timing: timing,
    best_time_to_buy: best
      ? { when: best.when, from: best.from, to: best.to, label: best.label, est_low: best.estLow ?? null, est_high: best.estHigh ?? null, basis: best.basis }
      : null,
    notes,
  };
}
