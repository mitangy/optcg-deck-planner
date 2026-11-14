import { describe, expect, it } from "vitest";
import { artKind, bestTimeToBuy, estimateBand, buyableDay, buyTiming, expectedRatio, SEASON_PCT, seasonFactor, settledRatio, typicalCurve, type ArtKind, type PricePoint } from "./priceTiming";

/** `today` minus `days`, as an ISO day. */
function ago(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** A flat daily series at `price` for the last `days` days up to `today`. */
function flat(today: string, days: number, price: number): PricePoint[] {
  return Array.from({ length: days + 1 }, (_, i) => ({ date: ago(today, days - i), price }));
}

const RELEASED = "2026-01-01";
/** `age` days after RELEASED. */
const at = (age: number) => ago("2026-01-01", -age);

/** A release in July, September and so on: the next 6 months of season then fall less than the release curve does, so the verdict is the curve's. RELEASED (January) rides the February peak, which makes the season part of every drop. */
const R_JUL = "2026-07-01";
const R_SEP = "2026-09-01";

function timing(kind: ArtKind, age: number, extra: { points?: PricePoint[]; current?: number; released?: string } = {}) {
  const released = extra.released ?? RELEASED;
  return buyTiming({ kind, released, today: ago(released, -age), points: extra.points ?? [], current: extra.current ?? 10 });
}

describe("artKind (#946)", () => {
  it("reads chase arts from the TCGPlayer name", () => {
    for (const mark of ["(Manga)", "(SP)", "(TR)", "(Treasure Rare)", "(Wanted Poster)", "(Gold)", "(Alternate Art) (Manga)"]) {
      expect(artKind(`Monkey.D.Luffy ${mark}`), mark).toBe("chase");
    }
  });

  it("reads alt arts, and keeps a chase mark ahead of the alt mark", () => {
    expect(artKind("Roronoa Zoro (Alternate Art)")).toBe("alt");
    expect(artKind("Roronoa Zoro (Parallel)")).toBe("alt");
    expect(artKind("Roronoa Zoro (Manga) (Alternate Art)")).toBe("chase");
  });

  it("does not take a card name for an art mark", () => {
    expect(artKind("Gold Roger")).toBe("other");
    expect(artKind("Treasure Hunter Nami", "SR")).toBe("baseRare");
    expect(artKind("Sp Squad")).toBe("other");
  });

  it("calls a base SR, SEC or Leader baseRare only when its rarity is known", () => {
    expect(artKind("Portgas.D.Ace")).toBe("other");
    expect(artKind("Portgas.D.Ace", "SR")).toBe("baseRare");
    expect(artKind("Portgas.D.Ace", "sec")).toBe("baseRare");
    expect(artKind("Portgas.D.Ace", "L")).toBe("baseRare");
    expect(artKind("Portgas.D.Ace", "R")).toBe("other");
    expect(artKind("Portgas.D.Ace (Alternate Art)", "SR")).toBe("alt");
  });
});

describe("typical curve (#946)", () => {
  it("interpolates linearly between the 14-day marks", () => {
    expect(expectedRatio("alt", 28)).toBe(79);
    expect(expectedRatio("alt", 35)).toBeCloseTo(72.5, 6);
    expect(expectedRatio("baseRare", 7)).toBeCloseTo(92, 6);
    expect(expectedRatio("chase", 357)).toBeCloseTo(145.5, 6);
  });

  it("is 100 before release and holds the last value after a year", () => {
    expect(expectedRatio("alt", -20)).toBe(100);
    expect(expectedRatio("alt", 0)).toBe(100);
    expect(expectedRatio("chase", 364)).toBe(148);
    expect(expectedRatio("chase", 900)).toBe(148);
  });

  it("lists 27 marks per kind, every 14 days", () => {
    for (const kind of ["alt", "chase", "baseRare", "other"] as ArtKind[]) {
      const c = typicalCurve(kind);
      expect(c).toHaveLength(27);
      expect(c[26].day).toBe(364);
      expect(c[1].day).toBe(14);
    }
    expect(typicalCurve("other")[2].ratio).toBe(78);
  });
});

describe("buyTiming verdicts (#946)", () => {
  it("says unknown without a release date or a current price", () => {
    expect(buyTiming({ kind: "alt", released: null, today: "2026-06-01", points: [], current: 10 }).verdict).toBe("unknown");
    expect(buyTiming({ kind: "alt", released: RELEASED, today: "2026-06-01", points: [], current: null }).verdict).toBe("unknown");
    expect(buyTiming({ kind: "chase", released: RELEASED, today: "2026-06-01", points: [], current: 0 }).verdict).toBe("unknown");
  });

  it("tells you to wait during presale, for every kind", () => {
    for (const kind of ["alt", "baseRare", "other", "chase"] as ArtKind[]) {
      const t = buyTiming({ kind, released: "2026-12-01", today: "2026-11-04", points: [], current: 30 });
      expect(t.verdict, kind).toBe("wait");
      expect(t.reasons.join(" ")).toMatch(/presale/i);
    }
  });

  it("waits on an alt art 30 days after release, with the typical further drop", () => {
    // The release curve alone says 24% to day 180 (#946); released in January the season adds a few points on top (#1311).
    const t = timing("alt", 30);
    expect(t.verdict).toBe("wait");
    expect(t.expectedFurtherDropPct).toBe(28);
    expect(t.reasons[0]).toBe("Similar cards fell another ~28% by 6 months.");
  });

  it("calls a base rare good at day 90 and still a wait at day 30", () => {
    expect(timing("baseRare", 90, { released: R_SEP }).verdict).toBe("good");
    expect(timing("baseRare", 90, { released: R_SEP }).reasons[0]).toMatch(/most of the typical drop is done/i);
    expect(timing("baseRare", 30, { released: R_SEP }).verdict).toBe("wait");
  });

  it("is soon when the typical remaining drop is 10 to 15 percent, good below that", () => {
    const soon = timing("alt", 40, { released: R_JUL });
    expect(soon.verdict).toBe("soon");
    expect(soon.expectedFurtherDropPct).toBe(13);
    expect(timing("baseRare", 126, { released: "2026-06-01" }).verdict).toBe("soon");
    const good = timing("alt", 90, { released: R_JUL });
    expect(good.verdict).toBe("good");
    expect(good.expectedFurtherDropPct).toBe(6);
  });

  it("uses the all-singles curve for an unclassified art", () => {
    // The all-singles curve falls less than an alt art's from day 30 (21% against 28% released in January) (#946).
    const t = timing("other", 30);
    expect(t.verdict).toBe("wait");
    expect(t.expectedFurtherDropPct).toBe(21);
  });

  it("does not say the price will fall further when the kind usually rises later", () => {
    // Day 300 of an alt art released in February is 28 Nov: the curve is flat and the season is about to climb.
    const t = timing("alt", 300, { released: "2026-02-01" });
    expect(t.verdict).toBe("good");
    expect(t.expectedFurtherDropPct).toBe(0);
  });

  it("says a chase art holds, and compares today to its 30-day average", () => {
    const today = at(200);
    const t = buyTiming({ kind: "chase", released: RELEASED, today, points: flat(today, 29, 100), current: 80 });
    expect(t.verdict).toBe("holds");
    expect(t.expectedFurtherDropPct).toBeUndefined();
    expect(t.reasons[0]).toBe("Cards like this have kept or gained value; waiting rarely pays. Buy on a dip below its recent average.");
    expect(t.reasons[1]).toBe("Now $80.00, 20% below its 30-day average of $100.00.");
    const above = buyTiming({ kind: "chase", released: RELEASED, today, points: flat(today, 29, 100), current: 125 });
    expect(above.reasons[1]).toBe("Now $125.00, 25% above its 30-day average of $100.00.");
  });

  it("leaves the average out when there are no recent points", () => {
    const today = at(200);
    const old = flat(ago(today, 60), 10, 100);
    expect(buyTiming({ kind: "chase", released: RELEASED, today, points: old, current: 80 }).reasons).toHaveLength(1);
  });
});

describe("buyTiming 30-day low (#946)", () => {
  // Day 90 of a base rare released in September: a "good" verdict, so the 30-day low reason can show.
  const today = ago(R_SEP, -90);
  const withLow = (low: number, current: number, kind: ArtKind = "baseRare") =>
    buyTiming({ kind, released: R_SEP, today, points: [...flat(today, 29, 100).slice(0, 10), { date: ago(today, 5), price: low }, { date: today, price: current }], current });

  it("adds a reason when the price is more than 15 percent above the 30-day low", () => {
    const t = withLow(100, 116);
    expect(t.verdict).toBe("good");
    expect(t.reasons).toContain("It is 16% above its 30-day low.");
  });

  it("adds nothing at exactly 15 percent", () => {
    expect(withLow(100, 115).reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });

  it("applies to soon as well, and never to wait", () => {
    const soonDay = ago(R_JUL, -40);
    const soon = buyTiming({ kind: "alt", released: R_JUL, today: soonDay, points: [{ date: ago(soonDay, 3), price: 10 }, { date: soonDay, price: 12 }], current: 12 });
    expect(soon.verdict).toBe("soon");
    expect(soon.reasons).toContain("It is 20% above its 30-day low.");
    const waitT = buyTiming({ kind: "alt", released: RELEASED, today: at(30), points: [{ date: at(25), price: 10 }, { date: at(30), price: 12 }], current: 12 });
    expect(waitT.verdict).toBe("wait");
    expect(waitT.reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });

  it("counts day 30 back but not day 31", () => {
    const base = { kind: "baseRare" as const, released: R_SEP, today, current: 130 };
    const edge = buyTiming({ ...base, points: [{ date: ago(today, 30), price: 100 }, { date: today, price: 130 }] });
    expect(edge.reasons).toContain("It is 30% above its 30-day low.");
    const older = buyTiming({ ...base, points: [{ date: ago(today, 31), price: 100 }, { date: today, price: 130 }] });
    expect(older.reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });
});

describe("buyTiming season note (#946, #1311)", () => {
  const note = (today: string, age = 200) =>
    buyTiming({ kind: "alt", released: ago(today, age), today, points: [], current: 10 }).seasonNote;
  const MIDDLE = "Older cards have run about 7% above their yearly average in February and 8% below in November (2024–2026).";

  it("says where a high month sits against the November low", () => {
    expect(note("2027-02-10")).toBe("A pricey time of year: older cards have run about 7% above their yearly average in February, against 8% below in November (2024–2026).");
    expect(note("2027-04-01")).toBe("A pricey time of year: older cards have run about 4% above their yearly average in April, against 8% below in November (2024–2026).");
  });

  it("says where a low month sits against the February peak", () => {
    expect(note("2026-11-14")).toBe("Usually a cheap time of year: older cards have run about 8% below their yearly average in November, against 7% above in February (2024–2026).");
    expect(note("2026-09-15")).toBe("Usually a cheap time of year: older cards have run about 4% below their yearly average in September, against 7% above in February (2024–2026).");
  });

  it("gives both ends of the year in a middle month", () => {
    expect(note("2026-07-15")).toBe(MIDDLE);
    expect(note("2026-06-15")).toBe(MIDDLE);
    expect(note("2026-07-31")).toBe(MIDDLE);
  });

  it("is only for cards at least 120 days old", () => {
    expect(note("2026-09-15", 119)).toBeUndefined();
    expect(note("2026-09-15", 120)).toContain("cheap time of year");
  });

  it("comes with a chase verdict too", () => {
    const t = buyTiming({ kind: "chase", released: "2026-01-01", today: "2026-09-15", points: [], current: 10 });
    expect(t.verdict).toBe("holds");
    expect(t.seasonNote).toContain("cheap time of year");
  });
});

describe("bestTimeToBuy (#952)", () => {
  const best = (kind: ArtKind, age: number, extra: { points?: PricePoint[]; current?: number | null; released?: string | null; today?: string } = {}) =>
    bestTimeToBuy({
      kind,
      released: extra.released === undefined ? RELEASED : extra.released,
      today: extra.today ?? at(age),
      points: extra.points ?? [],
      current: extra.current === undefined ? 10 : extra.current,
    });

  it("tells a chase card in presale to wait for the dip just after release, not buy now", () => {
    expect(best("chase", -10, { current: 300 })).toEqual({
      when: "window",
      from: "2026-01-08",
      to: "2026-03-02",
      label: "Jan 2026 – Mar 2026",
      basis: "Presale prices usually run well above release day. Cards like this have dipped in the first weeks after release, then climbed.",
    });
  });

  it("calls an alt art buyable 41 days after release, within 10 percent of where it settles", () => {
    expect(settledRatio("alt")).toBe(61);
    // Day 40 is still 67.86 (above 61 * 1.1 = 67.1), day 41 is 66.93.
    expect(buyableDay("alt")).toBe(41);
  });

  it("puts the window in the cheap months, with an estimate from the curve and the season, for a fresh alt art", () => {
    // Released 1 Jul, 20 days old: buyable from 11 Aug on the curve, but the Aug-Oct lows and the November trough are cheaper still (#1311).
    const b = best("alt", 20, { current: 50, released: "2026-07-01", today: "2026-07-21" })!;
    expect(b).toEqual({
      when: "window",
      from: "2026-11-10",
      to: "2027-01-09",
      label: "Nov 2026 – Jan 2027",
      estLow: 23.57,
      estHigh: 52.79,
      estMid: 35.82,
      basis: "Similar cards reached a buyable price about 6 weeks after release and older cards have usually been cheaper around Nov, around 28% below today's price. Half of similar cards landed in this range.",
    });
  });

  it("writes a window that crosses a year with both years", () => {
    expect(best("alt", 20, { current: 50, released: "2026-07-01", today: "2026-07-21" })!.label).toBe("Nov 2026 – Jan 2027");
  });

  it("moves a young card's window off the February peak (#1311)", () => {
    // Released 1 Jan, 20 days old: the curve alone says 11 Feb, which is the seasonal peak. The window lands in the Aug-Oct lows instead.
    const b = best("alt", 20, { current: 50 })!;
    expect(b.when).toBe("window");
    expect(b.from >= "2026-07-01" && b.from <= "2026-11-30").toBe(true);
    expect(b.basis).toMatch(/cheaper around Aug/);
  });

  it("says now, with the 30-day low as the low end, once the typical drop is done", () => {
    const today = "2026-11-14";
    const points = [
      { date: ago(today, 31), price: 5 },
      { date: ago(today, 10), price: 24 },
      { date: ago(today, 3), price: 40 },
    ];
    const settled = { released: "2025-03-01", today };
    expect(best("alt", 0, { ...settled, points, current: 30 })).toEqual({
      when: "now",
      from: today,
      to: ago(today, -30),
      label: "Now",
      estLow: 24,
      estHigh: 30,
      basis: "Most of the typical drop is done and this is usually the cheapest time of year for older cards.",
    });
    // Cheaper than every recent price: today's price is the low end.
    expect(best("alt", 0, { ...settled, points, current: 20 })).toMatchObject({ estLow: 20, estHigh: 20 });
  });

  it("starts a window the day the typical price turns buyable, not before and not after", () => {
    // An unclassified art is buyable on day 38; released 1 Sep, day 38 is 9 Oct, when the best start is within two weeks.
    const other = (age: number) => best("other", age, { released: "2026-09-01", today: ago("2026-09-01", -age) })!;
    expect(buyableDay("other")).toBe(38);
    expect(other(37).when).toBe("window");
    expect(other(38).when).toBe("now");
  });

  it("gives a presale window with no estimate", () => {
    const b = best("alt", -31, { current: 100 })!;
    expect(b.when).toBe("window");
    expect(b.from).toBe("2026-08-05");
    expect(b.estLow).toBeUndefined();
    expect(b.estHigh).toBeUndefined();
    expect(b.basis).toBe("Similar cards reached a buyable price about 6 weeks after release and older cards have usually been cheaper around Aug.");
  });

  it("tells a chase art to wait for a dip toward its 30-day low, with the 30-day average as the high end", () => {
    const today = at(200);
    const points = [
      { date: ago(today, 40), price: 10 },
      { date: ago(today, 5), price: 80 },
      { date: ago(today, 2), price: 120 },
    ];
    expect(best("chase", 200, { points, current: 110 })).toEqual({
      when: "now",
      from: today,
      to: ago(today, -30),
      label: "Now, on a dip",
      estLow: 80,
      estHigh: 100,
      basis: "Cards like this have kept or gained value, so waiting rarely pays; aim for a dip toward its 30-day low.",
    });
    expect(best("chase", 200, { current: 110 })).toMatchObject({ estLow: 110, estHigh: 110 });
  });

  it("says now is the cheapest time of year in the autumn lows, and cheaper than average in the shoulder months, for older cards", () => {
    const basis = (today: string, age: number) => bestTimeToBuy({ kind: "alt", released: ago(today, age), today, points: [], current: 10 })!.basis;
    expect(basis("2026-10-15", 200)).toBe("Most of the typical drop is done and this is usually the cheapest time of year for older cards.");
    expect(basis("2026-12-10", 200)).toBe("Most of the typical drop is done and this is a cheaper than average time of year for older cards.");
  });

  it("is null without a release date or a current price", () => {
    expect(best("alt", 20, { released: null })).toBeNull();
    expect(best("alt", 20, { current: null })).toBeNull();
    expect(best("alt", 20, { current: 0 })).toBeNull();
  });
});

describe("seasonFactor (#1311)", () => {
  it("is the month's value on the 15th and a straight line between mid-months", () => {
    SEASON_PCT.forEach((pct, i) => {
      const day = `2026-${String(i + 1).padStart(2, "0")}-15`;
      expect(seasonFactor(day), day).toBeCloseTo(1 + pct / 100, 9);
    });
    // 16 of 31 days from 15 Jan (+4) towards 15 Feb (+7).
    expect(seasonFactor("2027-01-31")).toBeCloseTo(1 + (4 + (3 * 16) / 31) / 100, 9);
    // 28 Feb is 13 of 28 days from 15 Feb (+7) towards 15 Mar (+6).
    expect(seasonFactor("2027-02-28")).toBeCloseTo(1 + (7 - 13 / 28) / 100, 9);
  });

  it("wraps from December to January", () => {
    // 31 Dec is 16 of 31 days from 15 Dec (-4) towards 15 Jan (+4); 1 Jan is 17 of 31 days.
    expect(seasonFactor("2026-12-31")).toBeCloseTo(1 + (-4 + (8 * 16) / 31) / 100, 9);
    expect(seasonFactor("2027-01-01")).toBeCloseTo(1 + (-4 + (8 * 17) / 31) / 100, 9);
    expect(seasonFactor("2027-01-01") - seasonFactor("2026-12-31")).toBeCloseTo(8 / 31 / 100, 9);
  });
});

describe("season in the buy timing (#1311)", () => {
  // The same settled alt art, bought at the same price, in February and in October.
  const RELEASED_OLD = "2025-03-01";
  const view = (today: string, extra: { current?: number; reprints?: string[]; kind?: ArtKind } = {}) => {
    const input = { kind: extra.kind ?? ("alt" as ArtKind), released: RELEASED_OLD, today, points: [] as PricePoint[], current: extra.current ?? 100, reprints: extra.reprints };
    return { timing: buyTiming(input), best: bestTimeToBuy(input)! };
  };

  it("waits for the autumn lows in February but says now in October (#1311)", () => {
    const feb = view("2026-02-10");
    expect(feb.timing.verdict).toBe("soon");
    expect(feb.timing.expectedFurtherDropPct).toBe(11);
    expect(feb.timing.reasons[0]).toBe("Older cards have usually been ~11% cheaper by Aug (prices run up from Christmas to a February peak, through tax refund season, then slide to a November low).");
    expect(feb.best.when).toBe("window");
    expect(feb.best.from >= "2026-08-01" && feb.best.from <= "2026-11-30").toBe(true);
    expect(feb.best.label).toBe("Sep 2026 – Nov 2026");
    expect(feb.best.estMid!).toBeLessThan(96);
    expect(feb.best.basis).toBe("Older cards have usually been cheaper around Sep, around 13% below today's price. Half of similar cards landed in this range.");

    const oct = view("2026-10-15");
    expect(oct.timing.verdict).toBe("good");
    expect(oct.best.when).toBe("now");
    expect(oct.best.label).toBe("Now");
  });

  it("calls a drop that is mostly the release curve a curve drop, not a season drop (#1311)", () => {
    const t = timing("alt", 30, { released: "2026-07-01" });
    expect(t.verdict).toBe("wait");
    expect(t.reasons[0]).toMatch(/^Similar cards fell another ~\d+% by 6 months\.$/);
  });

  it("does not wait nine months to save a percent or two (#1311)", () => {
    // Late August the autumn lows are only about 2.5% cheaper still: not worth waiting for.
    expect(view("2026-08-24").best.when).toBe("now");
  });

  it("treats a card under 50 cents as bulk and a card at 50 cents as an ordinary card (#1311)", () => {
    const bulk = view("2026-02-10", { current: 0.49 });
    expect(bulk.timing.verdict).toBe("good");
    expect(bulk.timing.headline).toBe("Bulk price — timing barely matters");
    expect(bulk.timing.reasons[0]).toMatch(/few cents/);
    expect(bulk.best.when).toBe("now");
    expect(bulk.best.label).toBe("Now");
    expect(bulk.best.basis).toMatch(/70%/);
    const ordinary = view("2026-02-10", { current: 0.5 });
    expect(ordinary.timing.verdict).toBe("soon");
    expect(ordinary.best.when).toBe("window");
    // A young bulk card is not told to wait for a window either.
    expect(timing("alt", 30, { current: 0.3 }).verdict).toBe("good");
    // Chase cards are never bulk.
    expect(view("2026-02-10", { current: 0.3, kind: "chase" }).timing.verdict).toBe("holds");
  });

  it("tells a card with a reprint coming within 120 days to wait, and pushes the window past the reprint (#1311)", () => {
    const none = view("2026-10-15");
    expect(none.timing.verdict).toBe("good");
    expect(none.best.when).toBe("now");
    const withReprint = view("2026-10-15", { reprints: ["2026-12-05"] });
    expect(withReprint.timing.verdict).toBe("wait");
    expect(withReprint.timing.reasons[0]).toBe("A reprint releases Dec 5, 2026; older printings have usually dropped ~10% in the two months after a reprint.");
    expect(withReprint.best.when).toBe("window");
    expect(withReprint.best.from >= "2027-01-04").toBe(true);
    expect(withReprint.best.estMid).toBe(93.47);
    expect(withReprint.best.basis).toMatch(/reprint/);
  });

  it("starts the window a month after the reprint when the season would otherwise say earlier (#1311)", () => {
    // Mid-July the lows start in October; a 1 Sep reprint puts the dip from 1 Oct on.
    const b = view("2027-07-15", { reprints: ["2027-09-01"] }).best;
    expect(b.when).toBe("window");
    expect(b.from).toBe("2027-10-01");
  });

  it("gives a young alt art a window within two months of its buyable day, not a year out (#1311)", () => {
    // Released 15 Oct, 20 days old on 4 Nov: buyable 25 Nov. A 365-day search would jump to the autumn 2027 lows.
    const b = bestTimeToBuy({ kind: "alt", released: "2026-10-15", today: "2026-11-04", points: [], current: 50 })!;
    expect(b.when).toBe("window");
    expect(b.from >= "2026-11-25" && b.from <= "2027-01-25").toBe(true);
  });

  it("says now when the best start is within two weeks, and waits when it is three weeks off (#1311)", () => {
    const at = (today: string) => bestTimeToBuy({ kind: "alt", released: "2025-06-01", today, points: [], current: 100 })!;
    expect(at("2025-10-10")).toMatchObject({ when: "now", label: "Now" });
    expect(at("2025-10-09")).toMatchObject({ when: "window", from: "2025-10-30" });
  });

  it("ignores a reprint more than 120 days away and a reprint already out (#1311)", () => {
    // 15 Oct + 120 days is 12 Feb; 13 Feb is out of range.
    expect(view("2026-10-15", { reprints: ["2027-02-12"] }).timing.verdict).toBe("wait");
    expect(view("2026-10-15", { reprints: ["2027-02-13"] }).timing.verdict).toBe("good");
    expect(view("2026-10-15", { reprints: ["2027-02-13"] }).best.when).toBe("now");
    expect(view("2026-10-15", { reprints: ["2026-09-01"] }).timing.verdict).toBe("good");
  });

  it("only mentions a reprint from the last 60 days, without changing the verdict (#1311)", () => {
    const info = "A reprint released Aug 16, 2026; older printings have usually dropped ~10% in the two months after a reprint.";
    // 15 Oct is 60 days after 16 Aug.
    const recent = view("2026-10-15", { reprints: ["2026-08-16"] });
    expect(recent.timing.verdict).toBe("good");
    expect(recent.timing.reasons).toContain(info);
    expect(view("2026-10-15", { reprints: ["2026-08-15"] }).timing.reasons).not.toContain(info.replace("Aug 16", "Aug 15"));
  });

  it("says a dip matters more for a chase card in a high month (#1311)", () => {
    const high = view("2026-02-10", { kind: "chase" }).best;
    expect(high.label).toBe("Now, on a dip");
    expect(high.basis).toMatch(/run high at this time of year/);
    expect(view("2026-10-15", { kind: "chase" }).best.basis).not.toMatch(/run high/);
  });
});

describe("estimate band (#1311)", () => {
  it("interpolates linearly between the month marks and is exactly 1 now (#1311)", () => {
    expect(estimateBand("alt", 200, 0)).toEqual([1, 1]);
    // 45 days is half way from the 1 month mark (0.88-1.13) to the 2 month mark (0.81-1.22).
    const [lo, hi] = estimateBand("alt", 200, 45);
    expect(lo).toBeCloseTo(0.845, 9);
    expect(hi).toBeCloseTo(1.175, 9);
    // 3 months is half way from 2 to 4 months.
    expect(estimateBand("alt", 200, 90)[0]).toBeCloseTo(0.77, 9);
    // Past 6 months it stays at the 6 month mark.
    expect(estimateBand("alt", 200, 400)).toEqual([0.68, 1.52]);
  });

  it("is wider for a card under 60 days old and for chase differently (#1311)", () => {
    expect(estimateBand("alt", 59, 60)).toEqual([0.75, 1.31]);
    expect(estimateBand("alt", 60, 60)).toEqual([0.81, 1.22]);
    expect(estimateBand("chase", 200, 60)).toEqual([0.89, 1.15]);
  });

  it("builds a window's estimate from the band around the middle estimate (#1311)", () => {
    const b = bestTimeToBuy({ kind: "alt", released: "2025-03-01", today: "2026-02-10", points: [], current: 100 })!;
    // The window starts Sep 8, so its middle is 240 days out: past the 6 month mark.
    expect(b.estMid).toBe(86.78);
    expect(b.estLow).toBe(59.01);
    expect(b.estHigh).toBe(131.91);
    expect(b.basis).toMatch(/Half of similar cards landed in this range\.$/);
  });
});
