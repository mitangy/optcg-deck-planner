import { describe, expect, it } from "vitest";
import { artKind, buyTiming, expectedRatio, typicalCurve, type ArtKind, type PricePoint } from "./priceTiming";

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

function timing(kind: ArtKind, age: number, extra: { points?: PricePoint[]; current?: number } = {}) {
  return buyTiming({ kind, released: RELEASED, today: at(age), points: extra.points ?? [], current: extra.current ?? 10 });
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
    const t = timing("alt", 30);
    expect(t.verdict).toBe("wait");
    expect(t.expectedFurtherDropPct).toBe(24);
    expect(t.reasons[0]).toBe("Similar cards fell another ~24% by 6 months.");
  });

  it("calls a base rare good at day 90 and still a wait at day 30", () => {
    expect(timing("baseRare", 90).verdict).toBe("good");
    expect(timing("baseRare", 90).reasons[0]).toMatch(/most of the typical drop is done/i);
    expect(timing("baseRare", 30).verdict).toBe("wait");
  });

  it("is soon when the typical remaining drop is 10 to 15 percent, good below that", () => {
    const soon = timing("alt", 40);
    expect(soon.verdict).toBe("soon");
    expect(soon.expectedFurtherDropPct).toBe(14);
    expect(timing("baseRare", 126).verdict).toBe("soon");
    const good = timing("alt", 90);
    expect(good.verdict).toBe("good");
    expect(good.expectedFurtherDropPct).toBe(9);
  });

  it("uses the all-singles curve for an unclassified art", () => {
    // allSingles at day 30 is 76.6 and 64.1 at day 180: a 16% drop (an alt art would say 24%).
    const t = timing("other", 30);
    expect(t.verdict).toBe("wait");
    expect(t.expectedFurtherDropPct).toBe(16);
  });

  it("does not say the price will fall further when the kind usually rises later", () => {
    const t = timing("alt", 300);
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
  const today = at(90);
  const withLow = (low: number, current: number, kind: ArtKind = "baseRare") =>
    buyTiming({ kind, released: RELEASED, today, points: [...flat(today, 29, 100).slice(0, 10), { date: ago(today, 5), price: low }, { date: today, price: current }], current });

  it("adds a reason when the price is more than 15 percent above the 30-day low", () => {
    const t = withLow(100, 116);
    expect(t.verdict).toBe("good");
    expect(t.reasons).toContain("It is 16% above its 30-day low.");
  });

  it("adds nothing at exactly 15 percent", () => {
    expect(withLow(100, 115).reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });

  it("applies to soon as well, and never to wait", () => {
    const soonDay = at(40);
    const soon = buyTiming({ kind: "alt", released: RELEASED, today: soonDay, points: [{ date: ago(soonDay, 3), price: 10 }, { date: soonDay, price: 12 }], current: 12 });
    expect(soon.verdict).toBe("soon");
    expect(soon.reasons).toContain("It is 20% above its 30-day low.");
    const waitT = buyTiming({ kind: "alt", released: RELEASED, today: at(30), points: [{ date: at(25), price: 10 }, { date: at(30), price: 12 }], current: 12 });
    expect(waitT.verdict).toBe("wait");
    expect(waitT.reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });

  it("counts day 30 back but not day 31", () => {
    const base = { kind: "baseRare" as const, released: RELEASED, today, current: 130 };
    const edge = buyTiming({ ...base, points: [{ date: ago(today, 30), price: 100 }, { date: today, price: 130 }] });
    expect(edge.reasons).toContain("It is 30% above its 30-day low.");
    const older = buyTiming({ ...base, points: [{ date: ago(today, 31), price: 100 }, { date: today, price: 130 }] });
    expect(older.reasons.some((r) => /30-day low/.test(r))).toBe(false);
  });
});

describe("buyTiming season note (#946)", () => {
  const note = (today: string, age = 200) =>
    buyTiming({ kind: "alt", released: ago(today, age), today, points: [], current: 10 }).seasonNote;
  const WINTER = "Prices across the market tend to run higher in winter (peak in February); autumn has been cheaper.";
  const CHEAP = "This is usually the cheapest time of year for older cards.";

  it("says winter from December through March", () => {
    expect(note("2026-12-01")).toBe(WINTER);
    expect(note("2027-01-15")).toBe(WINTER);
    expect(note("2027-03-31")).toBe(WINTER);
  });

  it("says cheapest from August through October", () => {
    expect(note("2026-08-01")).toBe(CHEAP);
    expect(note("2026-10-31")).toBe(CHEAP);
  });

  it("says nothing in the months between", () => {
    for (const day of ["2026-04-01", "2026-07-31", "2026-11-01", "2026-11-30"]) expect(note(day), day).toBeUndefined();
  });

  it("is only for cards at least 120 days old", () => {
    expect(note("2026-09-15", 119)).toBeUndefined();
    expect(note("2026-09-15", 120)).toBe(CHEAP);
  });

  it("comes with a chase verdict too", () => {
    const t = buyTiming({ kind: "chase", released: "2026-01-01", today: "2026-09-15", points: [], current: 10 });
    expect(t.verdict).toBe("holds");
    expect(t.seasonNote).toBe(CHEAP);
  });
});
