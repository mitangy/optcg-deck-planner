import { describe, expect, it } from "vitest";
import { buyTiming } from "@optcg/price-timing";
import {
  artLabel,
  baseCardName,
  buyQuestion,
  buyTimingInput,
  HISTORY_RANGES,
  historyStats,
  minusMonths,
  nearestIndex,
  niceTicks,
  pointsInRange,
  rangeChangePct,
  releasedAgo,
  type PricePoint,
} from "./priceHistoryModel";

const range = (id: string) => HISTORY_RANGES.find((r) => r.id === id)!;
const pts = (rows: [string, number][]): PricePoint[] => rows.map(([date, price]) => ({ date, price }));

describe("price history helpers (#946)", () => {
  it("a range keeps the point on its cut-off day and drops the day before (#946)", () => {
    const points = pts([
      ["2026-07-31", 50],
      ["2026-08-01", 40],
      ["2026-09-15", 30],
      ["2026-11-01", 20],
    ]);
    // 3M back from Nov 1 is Aug 1.
    expect(pointsInRange(points, range("3m")).map((p) => p.date)).toEqual(["2026-08-01", "2026-09-15", "2026-11-01"]);
    expect(pointsInRange(points, range("1m")).map((p) => p.date)).toEqual(["2026-11-01"]);
    expect(pointsInRange(points, range("max"))).toHaveLength(4);
  });

  it("ranges count back from the latest point, not from today (#946)", () => {
    const stale = pts([
      ["2024-01-01", 5],
      ["2024-05-01", 6],
      ["2024-06-01", 7],
    ]);
    expect(pointsInRange(stale, range("1m")).map((p) => p.date)).toEqual(["2024-05-01", "2024-06-01"]);
  });

  it("subtracting months clamps to the end of a shorter month (#946)", () => {
    expect(minusMonths("2026-03-31", 1)).toBe("2026-02-28");
    expect(minusMonths("2026-01-15", 3)).toBe("2025-10-15");
    expect(minusMonths("2026-02-28", 12)).toBe("2025-02-28");
  });

  it("range change is first to last, null without two points or a zero start (#946)", () => {
    expect(rangeChangePct(pts([["2026-01-01", 50], ["2026-01-02", 60], ["2026-01-03", 45]]))).toBeCloseTo(-10);
    expect(rangeChangePct(pts([["2026-01-01", 50]]))).toBeNull();
    expect(rangeChangePct(pts([["2026-01-01", 0], ["2026-01-02", 3]]))).toBeNull();
  });

  it("stats find the peak in the middle, the low after it, and the drop from it (#946)", () => {
    const points = pts([
      ["2026-01-01", 20], // low before the peak must not count as "low since peak"
      ["2026-01-08", 180],
      ["2026-02-01", 120],
      ["2026-03-01", 70],
      ["2026-04-01", 90],
    ]);
    const stats = historyStats(points, 90);
    expect(stats.peak).toEqual({ date: "2026-01-08", price: 180 });
    expect(stats.lowSincePeak).toBe(70);
    expect(stats.changeFromPeakPct).toBeCloseTo(-50);
    expect(stats.now).toBe(90);
  });

  it("stats use the current price for Now and the drop, and the last point when there is none (#946)", () => {
    const points = pts([["2026-01-01", 100], ["2026-02-01", 80]]);
    expect(historyStats(points, 60).changeFromPeakPct).toBeCloseTo(-40);
    expect(historyStats(points, 60).lowSincePeak).toBe(60);
    expect(historyStats(points, null).now).toBe(80);
    expect(historyStats([], null)).toEqual({ now: null, peak: null, lowSincePeak: null, changeFromPeakPct: null });
  });

  it("release age counts days up to two months, then whole months (#946)", () => {
    expect(releasedAgo("2026-11-03", "2026-11-04")).toBe("1 day ago");
    expect(releasedAgo("2026-10-05", "2026-11-04")).toBe("30 days ago");
    expect(releasedAgo("2026-09-05", "2026-11-04")).toBe("60 days ago");
    expect(releasedAgo("2026-09-04", "2026-11-04")).toBe("2 months ago");
    expect(releasedAgo("2025-11-04", "2026-11-04")).toBe("12 months ago");
    expect(releasedAgo("2026-08-20", "2026-11-04")).toBe("2 months ago"); // the 3rd month is not complete until Nov 20
    expect(releasedAgo("2026-11-04", "2026-11-04")).toBe("today");
  });

  it("axis ticks are round numbers that cover the data (#946)", () => {
    const ticks = niceTicks(72, 183);
    expect(ticks[0]).toBeLessThanOrEqual(72);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(183);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks).toEqual([50, 100, 150, 200]);
    expect(niceTicks(1.1, 1.4)).toEqual([1.1, 1.2, 1.3, 1.4]);
  });

  it("hovering picks the point nearest in time, not nearest in position in the list (#946)", () => {
    const points = pts([["2026-01-01", 1], ["2026-01-02", 2], ["2026-03-01", 3]]);
    const feb = Math.floor(Date.parse("2026-02-10T00:00:00Z") / 86_400_000);
    expect(nearestIndex(points, feb)).toBe(2);
    expect(nearestIndex(points, feb - 39)).toBe(1);
  });
});

describe("Ask Log Pose about when to buy (#946)", () => {
  it("names the card, its art, its number and the product id of an alternate art", () => {
    expect(buyQuestion("Roronoa Zoro (Alternate Art)", "OP05-001", 543210)).toBe(
      "When is the best time to buy Roronoa Zoro (Alternate Art, OP05-001, product 543210)? Use its price history and how much it's being played.",
    );
  });

  it("calls the base art base art and leaves the product id out", () => {
    expect(buyQuestion("Roronoa Zoro", "OP05-001", 0)).toBe(
      "When is the best time to buy Roronoa Zoro (base art, OP05-001)? Use its price history and how much it's being played.",
    );
  });

  it("keeps every art mark and drops them from the card name", () => {
    expect(baseCardName("Monkey.D.Luffy (Alternate Art) (Manga)")).toBe("Monkey.D.Luffy");
    expect(artLabel("Monkey.D.Luffy (Alternate Art) (Manga)")).toBe("Alternate Art, Manga");
    expect(baseCardName("Tony Tony.Chopper")).toBe("Tony Tony.Chopper");
  });
});

describe("When to buy input (#949 follow-up)", () => {
  // A base SR released 60 days ago, now $10: the base SR curve is still falling, the all-singles curve has settled.
  const data = { name: "Portgas.D.Ace", released: "2026-09-06", current: 10 };
  const today = "2026-11-05";
  const points = pts([["2026-09-06", 10], ["2026-11-05", 10]]);

  it("reads a base SR, SEC or Leader with the base rare curve and says wait (#949)", () => {
    for (const rarity of ["SR", "SEC", "L"]) {
      const input = buyTimingInput({ ...data, rarity }, points, null, today);
      expect(input.kind, rarity).toBe("baseRare");
    }
    expect(buyTiming(buyTimingInput({ ...data, rarity: "SR" }, points, null, today)).verdict).not.toBe(buyTiming(buyTimingInput(data, points, null, today)).verdict);
  });

  it("keeps an alternate art on the alt curve whatever the card's rarity is (#949)", () => {
    expect(buyTimingInput({ ...data, name: "Portgas.D.Ace (Alternate Art)", rarity: "SR" }, points, null, today).kind).toBe("alt");
  });

  it("leaves a card with no known rarity on the all-singles curve (#949)", () => {
    expect(buyTimingInput({ ...data, rarity: null }, points, null, today).kind).toBe("other");
  });
});
