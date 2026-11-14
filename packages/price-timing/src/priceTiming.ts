import { formatMoney } from "@optcg/card-core";

/** Dates are ISO "YYYY-MM-DD" strings, read as UTC. */
export type PricePoint = { date: string; price: number };

export type ArtKind = "chase" | "alt" | "baseRare" | "other";
export type BuyVerdict = "wait" | "soon" | "good" | "holds" | "unknown";

export type BuyTiming = {
  verdict: BuyVerdict;
  headline: string;
  reasons: string[];
  /** Typical further drop from this age to 6 months, percent; set for cards that usually fall. */
  expectedFurtherDropPct?: number;
  seasonNote?: string;
};

const DAY_MS = 86_400_000;

export function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

/** Days since release at which the typical curves are sampled. */
export const CURVE_OFFSETS = [0, 14, 28, 42, 56, 70, 84, 98, 112, 126, 140, 154, 168, 182, 196, 210, 224, 238, 252, 266, 280, 294, 308, 322, 336, 350, 364];

/** Median price as a percent of the release-day price (924 singles, OP06-OP17, EB01-EB05, PRB-01/02, 2024-02 to 2026-11). */
const CURVES: Record<ArtKind, number[]> = {
  alt: [100, 85, 79, 66, 63, 63, 63, 66, 68, 68, 64, 61, 61, 58, 61, 61, 62, 60, 63, 63, 62, 63, 62, 64, 63, 63, 61],
  chase: [100, 86, 90, 89, 87, 92, 89, 90, 90, 89, 93, 87, 90, 95, 94, 96, 100, 99, 112, 116, 117, 120, 120, 124, 127, 143, 148],
  baseRare: [100, 84, 71, 61, 60, 60, 56, 57, 58, 58, 51, 54, 53, 52, 49, 52, 54, 52, 56, 59, 59, 61, 63, 61, 60, 52, 56],
  other: [100, 84, 78, 68, 67, 69, 67, 71, 71, 71, 68, 66, 66, 64, 65, 64, 66, 65, 67, 69, 66, 66, 69, 69, 70, 69, 69],
};

/** The curve as [day, percent of release-day price] pairs. */
export function typicalCurve(kind: ArtKind): { day: number; ratio: number }[] {
  return CURVE_OFFSETS.map((day, i) => ({ day, ratio: CURVES[kind][i]! }));
}

/** Typical price at `day` days after release, percent of the release-day price. Linear between the 14-day marks; 100 before release, flat after a year. */
export function expectedRatio(kind: ArtKind, day: number): number {
  const curve = CURVES[kind];
  if (!(day > 0)) return 100;
  const last = CURVE_OFFSETS.length - 1;
  if (day >= CURVE_OFFSETS[last]!) return curve[last]!;
  const i = Math.floor(day / 14);
  const t = (day - CURVE_OFFSETS[i]!) / 14;
  return curve[i]! + (curve[i + 1]! - curve[i]!) * t;
}

const CHASE_MARK = /manga|\bsp\b|\btr\b|treasure|wanted poster|\bgold\b/i;
const ALT_MARK = /alternate art|parallel/i;
const BASE_RARE = /^(sr|sec|l|super rare|secret rare|leader)$/i;

/** What kind of art a TCGPlayer product name is. A base SR / SEC / Leader needs its rarity to count as baseRare. */
export function artKind(name: string, rarity?: string | null): ArtKind {
  const marks = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).join(" ");
  if (CHASE_MARK.test(marks)) return "chase";
  if (ALT_MARK.test(marks) || /parallel/i.test(name)) return "alt";
  if (rarity && BASE_RARE.test(rarity.trim())) return "baseRare";
  return "other";
}

/** Where prices have mostly settled (days after release), and the typical remaining drop that means wait (15%) or almost there (10%, the "buyable" margin). */
const SETTLED_DAY = 180;
const WAIT_DROP = 0.15;
const SOON_DROP = 0.1;

const money = formatMoney;

function lastDays(points: PricePoint[], today: string, days: number): PricePoint[] {
  const to = dayNumber(today);
  return points.filter((p) => {
    const d = dayNumber(p.date);
    return d <= to && to - d <= days;
  });
}

/** Price level of older cards by calendar month (Jan first) against their yearly average, percent. Settled singles, detrended; only two winters of data (2024-25, 2025-26). */
export const SEASON_PCT = [4, 7, 6, 4, 3, 2, 0, -3, -4, -6, -8, -4];

/** The seasonal price factor on a date: 1 + the month's percent / 100, with a month's value at its 15th and a straight line between mid-months (Dec wraps to Jan). */
export function seasonFactor(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const mid = (yy: number, mm: number) => Math.floor(Date.UTC(yy, mm, 15) / DAY_MS);
  const [a, b] = d >= 15 ? [m, m + 1] : [m - 1, m];
  const x = dayNumber(iso);
  const x0 = mid(y, a);
  const x1 = mid(y, b);
  const v = (k: number) => SEASON_PCT[((k % 12) + 12) % 12]!;
  const pct = v(a) + ((v(b) - v(a)) * (x - x0)) / (x1 - x0);
  return 1 + pct / 100;
}

const DAY_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Older printings have usually fallen about this much more in the two months after a reprint set released; applied from this many days after it. */
const REPRINT_FACTOR = 0.9;
const REPRINT_LAG = 30;
const REPRINT_HORIZON = 120;
const REPRINT_RECENT = 60;

/** Relative expected price on a date: the release curve times the season, and the reprint dip once a reprint is a month out. Only ratios of two of these mean anything. */
export function expectedPrice(kind: ArtKind, released: string, date: string, reprint?: string | null): number {
  let p = expectedRatio(kind, dayNumber(date) - dayNumber(released)) * seasonFactor(date);
  if (reprint && dayNumber(date) >= dayNumber(reprint) + REPRINT_LAG) p *= REPRINT_FACTOR;
  return p;
}

function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function fullDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

function windowLabel(from: string, to: string): string {
  return `${monthYear(from)} – ${monthYear(to)}`;
}

/** The next reprint within 120 days after today, if any. */
function upcomingReprint(reprints: string[] | undefined, today: string): string | null {
  const t = dayNumber(today);
  const next = (reprints ?? []).filter((r) => dayNumber(r) > t && dayNumber(r) - t <= REPRINT_HORIZON).sort()[0];
  return next ?? null;
}

/** The latest reprint that released in the last 60 days, if any. */
function recentReprint(reprints: string[] | undefined, today: string): string | null {
  const t = dayNumber(today);
  const last = (reprints ?? []).filter((r) => dayNumber(r) <= t && t - dayNumber(r) <= REPRINT_RECENT).sort().pop();
  return last ?? null;
}

const BULK_BELOW = 0.5;

const SEASON_SHAPE = "prices run up from Christmas to a February peak, through tax refund season, then slide to a November low";

/** Where this month sits in the year for older cards, from SEASON_PCT; only said for cards a few months old. */
function seasonNote(today: string, age: number): string | undefined {
  if (age < 120) return undefined;
  const month = Number(today.slice(5, 7)) - 1;
  const hi = SEASON_PCT.indexOf(Math.max(...SEASON_PCT));
  const lo = SEASON_PCT.indexOf(Math.min(...SEASON_PCT));
  const peak = `${SEASON_PCT[hi]}% above`;
  const trough = `${Math.abs(SEASON_PCT[lo]!)}% below`;
  const pct = (seasonFactor(today) - 1) * 100;
  const now = SEASON_PCT[month]!;
  const nowText = now >= 0 ? `${now}% above` : `${-now}% below`;
  const here = `older cards have run about ${nowText} their yearly average in ${DAY_MONTHS[month]}`;
  if (pct >= 3) return `A pricey time of year: ${here}, against ${trough} in ${DAY_MONTHS[lo]} (2024–2026).`;
  if (pct <= -3) return `Usually a cheap time of year: ${here}, against ${peak} in ${DAY_MONTHS[hi]} (2024–2026).`;
  return `Older cards have run about ${peak} their yearly average in ${DAY_MONTHS[hi]} and ${trough} in ${DAY_MONTHS[lo]} (2024–2026).`;
}

export type BuyTimingInput = {
  kind: ArtKind;
  /** Release date of the set, ISO; null when unknown. */
  released: string | null;
  today: string;
  /** Daily market prices, oldest first. */
  points: PricePoint[];
  current: number | null;
  /** ISO release dates of later plain reprints of this card. */
  reprints?: string[];
};

/** A plain "when to buy" read from how similar cards moved after release and through the year. A judgement from past patterns, never a price forecast. */
export function buyTiming({ kind, released, today, points, current, reprints }: BuyTimingInput): BuyTiming {
  if (!released || current == null || !(current > 0)) {
    return { verdict: "unknown", headline: "Not enough data to say", reasons: ["There is no release date or current price for this art yet."] };
  }
  const age = dayNumber(today) - dayNumber(released);

  if (age < 0) {
    return {
      verdict: "wait",
      headline: "Wait for release",
      reasons: ["Presale prices are usually far above the price on release day, often several times higher."],
    };
  }

  const note = seasonNote(today, age);
  const noteField = note ? { seasonNote: note } : {};
  const recent = lastDays(points, today, 30);

  if (kind === "chase") {
    const reasons = ["Cards like this have kept or gained value; waiting rarely pays. Buy on a dip below its recent average."];
    if (recent.length >= 2) {
      const avg = recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const diff = ((current - avg) / avg) * 100;
      const where = Math.abs(diff) < 1 ? "in line with" : `${Math.abs(diff).toFixed(0)}% ${diff < 0 ? "below" : "above"}`;
      reasons.push(`Now ${money(current)}, ${where} its 30-day average of ${money(avg)}.`);
    }
    return { verdict: "holds", headline: "Tends to hold its value", reasons, ...noteField };
  }

  if (current < BULK_BELOW) {
    return {
      verdict: "good",
      headline: "Bulk price — timing barely matters",
      reasons: ["Cards this cheap only lose a few cents, so waiting is not worth it."],
      expectedFurtherDropPct: 0,
    };
  }

  const reprint = upcomingReprint(reprints, today);
  const nowP = expectedPrice(kind, released, today, reprint);
  let minP = nowP;
  let minDate = today;
  for (let d = 7; d <= SETTLED_DAY; d += 7) {
    const date = addDays(today, Math.min(d, SETTLED_DAY));
    const p = expectedPrice(kind, released, date, reprint);
    if (p < minP) {
      minP = p;
      minDate = date;
    }
  }
  const drop = Math.max(0, 1 - minP / nowP);
  const dropPct = Math.round(drop * 100);
  // How much of the drop is the release curve; the rest is season (and a reprint).
  const curveDrop = age >= SETTLED_DAY ? 0 : Math.max(0, 1 - expectedRatio(kind, SETTLED_DAY) / expectedRatio(kind, age));
  const seasonal = drop - curveDrop > curveDrop;
  const dropReason = seasonal
    ? `Older cards have usually been ~${dropPct}% cheaper by ${MONTHS[Number(minDate.slice(5, 7)) - 1]} (${SEASON_SHAPE}).`
    : `Similar cards fell another ~${dropPct}% by 6 months.`;

  const reasons: string[] = [];
  let verdict: BuyVerdict;
  let headline: string;
  if (drop >= WAIT_DROP) {
    verdict = "wait";
    headline = "Better to wait";
    reasons.push(dropReason);
  } else if (drop >= SOON_DROP) {
    verdict = "soon";
    headline = "Close to a good price";
    reasons.push(dropReason);
  } else {
    verdict = "good";
    headline = "A reasonable time to buy";
    reasons.push("Most of the typical drop is done at this age.");
  }

  if (reprint) {
    verdict = "wait";
    headline = "Better to wait";
    reasons.unshift(`A reprint releases ${fullDate(reprint)}; older printings have usually dropped ~10% in the two months after a reprint.`);
  } else {
    const past = recentReprint(reprints, today);
    if (past) reasons.push(`A reprint released ${fullDate(past)}; older printings have usually dropped ~10% in the two months after a reprint.`);
  }

  if (verdict !== "wait" && recent.length) {
    const low = Math.min(...recent.map((p) => p.price));
    const above = ((current - low) / low) * 100;
    if (low > 0 && above > 15) reasons.push(`It is ${above.toFixed(0)}% above its 30-day low.`);
  }

  return { verdict, headline, reasons, expectedFurtherDropPct: dropPct, ...noteField };
}

export type BestBuy = {
  when: "now" | "window";
  /** ISO dates. */
  from: string;
  to: string;
  /** Short, e.g. "Now", "Now, on a dip", "Dec 2026 – Jan 2027". */
  label: string;
  /** Estimated price range in USD; left out when the price now says little about it. */
  estLow?: number;
  estHigh?: number;
  basis: string;
};

/** Where a kind's price typically sits once settled (percent of release-day price): the median of the 154 to 210 day marks. */
export function settledRatio(kind: ArtKind): number {
  const r = [154, 168, 182, 196, 210].map((d) => expectedRatio(kind, d)).sort((a, b) => a - b);
  return r[2]!;
}

/** The first day after release at which a kind's typical price is within 10% of where it settles. */
export function buyableDay(kind: ArtKind): number {
  const target = settledRatio(kind) * (1 + SOON_DROP);
  for (let d = 0; d < 365; d++) if (expectedRatio(kind, d) <= target) return d;
  return 364;
}

const cents = (x: number) => Math.round(x * 100) / 100;

const SEARCH_DAYS = 240;
const STEP_DAYS = 7;
const SCORE_DAYS = 30;
const NEAR_MIN = 1.02;
const NOW_WITHIN = 14;
/** A wait that saves less than this is not worth it: buy now. */
const MIN_SAVING = 0.03;

/** The best time to buy and roughly what it should cost then, from how similar cards moved after release and through the year. A pattern of past sets, never a forecast. */
export function bestTimeToBuy({ kind, released, today, points, current, reprints }: BuyTimingInput): BestBuy | null {
  if (!released || current == null || !(current > 0)) return null;
  const age = dayNumber(today) - dayNumber(released);
  const recent = lastDays(points, today, 30);
  const low = recent.length ? Math.min(...recent.map((p) => p.price)) : current;

  if (kind === "chase" && age < 0) {
    // Presale runs far above release day; chase cards have dipped in the first weeks before climbing.
    const from = addDays(released, 7);
    const to = addDays(released, 60);
    return { when: "window", from, to, label: windowLabel(from, to), basis: "Presale prices usually run well above release day. Cards like this have dipped in the first weeks after release, then climbed." };
  }

  if (kind === "chase") {
    const avg = recent.length ? recent.reduce((s, p) => s + p.price, 0) / recent.length : current;
    const high = seasonFactor(today) >= 1.03;
    return {
      when: "now",
      from: today,
      to: addDays(today, 30),
      label: "Now, on a dip",
      estLow: cents(low),
      estHigh: cents(avg),
      basis: `Cards like this have kept or gained value, so waiting rarely pays; aim for a dip toward its 30-day low.${high ? " Prices across the market run high at this time of year, so a dip matters more." : ""}`,
    };
  }

  if (age >= 0 && current < BULK_BELOW) {
    return {
      when: "now",
      from: today,
      to: addDays(today, 30),
      label: "Now",
      estLow: cents(Math.min(low, current)),
      estHigh: cents(current),
      basis: "Cards under $0.50 only fall to about 70% and the cents don't matter, so buy when you need it.",
    };
  }

  const day = buyableDay(kind);
  const reprint = upcomingReprint(reprints, today);
  const todayP = age >= 0 ? expectedPrice(kind, released, today, reprint) : 0;
  let start0 = addDays(released, day);
  if (dayNumber(today) > dayNumber(start0)) start0 = today;
  if (reprint) {
    const after = addDays(reprint, REPRINT_LAG);
    if (dayNumber(after) > dayNumber(start0)) start0 = after;
  }
  const score = (start: string) => {
    let sum = 0;
    for (let d = 0; d < SCORE_DAYS; d++) sum += expectedPrice(kind, released, addDays(start, d), reprint);
    return sum / SCORE_DAYS;
  };
  const starts: { start: string; score: number }[] = [];
  for (let d = 0; d <= SEARCH_DAYS; d += STEP_DAYS) {
    const start = addDays(start0, d);
    starts.push({ start, score: score(start) });
  }
  const min = Math.min(...starts.map((s) => s.score));
  const best = starts.find((s) => s.score <= min * NEAR_MIN)!;
  const fromNow = dayNumber(best.start) - dayNumber(today);

  if (age >= day && (fromNow <= NOW_WITHIN || (current * best.score) / todayP >= current * (1 - MIN_SAVING))) {
    const sf = seasonFactor(today);
    const cheap = sf <= 0.94 ? " and this is usually the cheapest time of year for older cards" : sf <= 0.97 ? " and this is a cheaper than average time of year for older cards" : "";
    return {
      when: "now",
      from: today,
      to: addDays(today, 30),
      label: "Now",
      estLow: cents(Math.min(low, current)),
      estHigh: cents(current),
      basis: `Most of the typical drop is done${cheap}.`,
    };
  }

  const from = best.start;
  const to = addDays(from, 60);
  const parts: string[] = [];
  if (age < day) parts.push(`similar cards reached a buyable price about ${Math.round(day / 7)} weeks after release`);
  const startMonth = MONTHS[Number(addDays(from, 15).slice(5, 7)) - 1]!;
  if (seasonFactor(addDays(from, 15)) < seasonFactor(start0) - 0.02) parts.push(`older cards have usually been cheaper around ${startMonth}`);
  if (reprint) parts.push("older printings have usually dropped ~10% in the two months after a reprint");
  if (!parts.length) parts.push("the typical curve and season put the lowest price around then");
  const out: BestBuy = { when: "window", from, to, label: windowLabel(from, to), basis: "" };
  let sentence = parts.join(" and ");
  sentence = sentence[0]!.toUpperCase() + sentence.slice(1);
  if (age >= 0) {
    const est = (current * best.score) / todayP;
    out.estLow = cents(est * 0.9);
    out.estHigh = cents(est * 1.1);
    if (est < current) sentence += `, around ${Math.round((1 - est / current) * 100)}% below today's price`;
  }
  out.basis = `${sentence}.`;
  return out;
}
