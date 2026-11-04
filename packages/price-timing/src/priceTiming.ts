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

const money = (x: number) => `$${x.toFixed(2)}`;

function lastDays(points: PricePoint[], today: string, days: number): PricePoint[] {
  const to = dayNumber(today);
  return points.filter((p) => {
    const d = dayNumber(p.date);
    return d <= to && to - d <= days;
  });
}

/** Winter has run higher (peak in February), Aug to Oct cheaper; only said for cards a few months old. */
function seasonFor(today: string, age: number): string | undefined {
  if (age < 120) return undefined;
  const month = Number(today.slice(5, 7));
  if (month === 12 || month <= 3) return "Prices across the market tend to run higher in winter (peak in February); autumn has been cheaper.";
  if (month >= 8 && month <= 10) return "This is usually the cheapest time of year for older cards.";
  return undefined;
}

export type BuyTimingInput = {
  kind: ArtKind;
  /** Release date of the set, ISO; null when unknown. */
  released: string | null;
  today: string;
  /** Daily market prices, oldest first. */
  points: PricePoint[];
  current: number | null;
};

/** A plain "when to buy" read from how similar cards moved after release. A judgement from past patterns, never a price forecast. */
export function buyTiming({ kind, released, today, points, current }: BuyTimingInput): BuyTiming {
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

  const seasonNote = seasonFor(today, age);
  const recent = lastDays(points, today, 30);

  if (kind === "chase") {
    const reasons = ["Cards like this have kept or gained value; waiting rarely pays. Buy on a dip below its recent average."];
    if (recent.length >= 2) {
      const avg = recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const diff = ((current - avg) / avg) * 100;
      const where = Math.abs(diff) < 1 ? "in line with" : `${Math.abs(diff).toFixed(0)}% ${diff < 0 ? "below" : "above"}`;
      reasons.push(`Now ${money(current)}, ${where} its 30-day average of ${money(avg)}.`);
    }
    return { verdict: "holds", headline: "Tends to hold its value", reasons, ...(seasonNote ? { seasonNote } : {}) };
  }

  // Past 6 months there is no "further drop to 6 months" left to expect.
  const drop = age >= SETTLED_DAY ? 0 : 1 - expectedRatio(kind, SETTLED_DAY) / expectedRatio(kind, age);
  const dropPct = Math.max(0, Math.round(drop * 100));
  const reasons: string[] = [];
  let verdict: BuyVerdict;
  let headline: string;
  if (drop >= WAIT_DROP) {
    verdict = "wait";
    headline = "Better to wait";
    reasons.push(`Similar cards fell another ~${dropPct}% by 6 months.`);
  } else if (drop >= SOON_DROP) {
    verdict = "soon";
    headline = "Close to a good price";
    reasons.push(`Similar cards fell another ~${dropPct}% by 6 months.`);
  } else {
    verdict = "good";
    headline = "A reasonable time to buy";
    reasons.push("Most of the typical drop is done at this age.");
  }

  if (verdict !== "wait" && recent.length) {
    const low = Math.min(...recent.map((p) => p.price));
    const above = ((current - low) / low) * 100;
    if (low > 0 && above > 15) reasons.push(`It is ${above.toFixed(0)}% above its 30-day low.`);
  }

  return { verdict, headline, reasons, expectedFurtherDropPct: dropPct, ...(seasonNote ? { seasonNote } : {}) };
}
