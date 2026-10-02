import { describe, expect, it } from "vitest";
import { computeDeckStats, normalizeStatsCardId, type StatsAtlas } from "./deckStats";

// Hand-built atlas: every card is chosen so a wrong bucket, divisor or boundary changes the answer.
const atlas: StatsAtlas = {
  "T-C1": { t: "character", col: ["red"], cost: 1, pow: 2500, ctr: 1000, tr: ["Straw Hat Crew"], at: ["Slash"], rl: ["search"] },
  "T-C2": { t: "character", col: ["red"], cost: 4, pow: 5000, ctr: 2000, tr: ["Straw Hat Crew", "Supernovas"], at: ["Slash", "Strike"], kw: ["Blocker"], tm: ["On Play"], trg: 1, rl: ["draw", "removal"] },
  "T-C3": { t: "character", col: ["green"], cost: 10, pow: 12000, tr: ["Navy"], at: ["Strike"], tm: ["On K.O."] },
  "T-C4": { t: "character", col: ["green", "red"], cost: 12, pow: 2999, tr: ["Navy", "Supernovas"] },
  "T-C5": { t: "character", col: ["red"], cost: 5, pow: 6000, ctr: 1000, tr: ["Straw Hat Crew"] },
  "T-C6": { t: "character", col: ["red"], cost: 6, pow: 7000, tr: ["Straw Hat Crew"] },
  "T-E1": { t: "event", col: ["red"], cost: 3, tr: ["Straw Hat Crew"], tm: ["Counter"] },
  "T-E2": { t: "event", col: ["green"], cost: 2, tm: ["Main"], trg: 1 },
  "T-S1": { t: "stage", col: ["blue"], cost: 2 },
  "T-LC": { t: "leader", col: ["red", "blue"], pow: 5000, life: 5 },
  "T-LA": { t: "leader", col: ["red"], rules: ["max_cost:5", "only_trait:Straw Hat Crew"] },
  "T-LB": { t: "leader", col: ["green"], rules: ["no_events_cost_ge:3"] },
};

const deck = [
  { id: "T-C1", copies: 4 },
  { id: "T-C2", copies: 3 },
  { id: "T-C3", copies: 2 },
  { id: "T-C4", copies: 1 },
  { id: "T-C5", copies: 2 },
  { id: "T-E1", copies: 2 },
  { id: "T-E2", copies: 1 },
  { id: "T-S1", copies: 1 },
];

describe("computeDeckStats", () => {
  const stats = computeDeckStats(deck, atlas, "T-LC");

  it("counts copies by card type", () => {
    expect(stats.total).toBe(16);
    expect(stats.byType).toEqual({ character: 12, event: 3, stage: 1 });
  });

  it("stacks the cost curve by type and folds cost 10 and above into the last bucket", () => {
    const c = stats.costCurve;
    expect(c).toHaveLength(11);
    expect(c[1]).toMatchObject({ character: 4, event: 0, stage: 0, total: 4 });
    expect(c[2]).toMatchObject({ character: 0, event: 1, stage: 1, total: 2 });
    expect(c[3]).toMatchObject({ event: 2, total: 2 });
    expect(c[4]).toMatchObject({ character: 3, total: 3 });
    // T-C3 costs 10 (2 copies) and T-C4 costs 12 (1 copy).
    expect(c[9]!.total).toBe(0);
    expect(c[10]).toMatchObject({ character: 3, total: 3 });
  });

  it("buckets Character power down to 1000 steps and keeps empty steps between", () => {
    const byPower = Object.fromEntries(stats.powerCurve.map((p) => [p.power, p.count]));
    // 2500 and 2999 both floor to 2000.
    expect(byPower[2000]).toBe(5);
    expect(byPower[3000]).toBe(0);
    expect(byPower[5000]).toBe(3);
    expect(byPower[6000]).toBe(2);
    expect(byPower[12000]).toBe(2);
    expect(stats.powerCurve).toHaveLength(11);
  });

  it("averages counter over every card, counting no-counter cards as zero", () => {
    expect(stats.counter.totalCounter).toBe(12000);
    expect(stats.counter.average).toBe(750);
    expect(stats.counter).toMatchObject({ none: 7, c1000: 6, c2000: 3, other: 0 });
  });

  it("counts Counter events by copies", () => {
    expect(stats.counter.events).toBe(2);
  });

  it("computes the expected opening hand from the deck's counter and Trigger density", () => {
    expect(stats.triggers).toBe(4);
    expect(stats.openingHand.size).toBe(5);
    expect(stats.openingHand.expectedCounter).toBe(3750);
    expect(stats.openingHand.expectedTriggers).toBeCloseTo(1.25, 10);
  });

  it("caps the opening hand at the deck size for tiny lists", () => {
    const tiny = computeDeckStats([{ id: "T-C2", copies: 3 }], atlas);
    expect(tiny.openingHand.size).toBe(3);
    expect(tiny.openingHand.expectedCounter).toBe(6000);
  });

  it("ranks traits by copies with a limit and counts colors per copy", () => {
    const top = computeDeckStats(deck, atlas, "T-LC", { topTraits: 2 });
    expect(top.traits).toEqual([
      { name: "Straw Hat Crew", count: 11 },
      { name: "Supernovas", count: 4 },
    ]);
    expect(stats.colors).toEqual([
      { name: "red", count: 12 },
      { name: "green", count: 4 },
      { name: "blue", count: 1 },
    ]);
    expect(stats.keywords).toEqual([{ name: "Blocker", count: 3 }]);
    expect(stats.roles).toEqual([
      { name: "Search", count: 4 },
      { name: "Draw", count: 3 },
      { name: "Removal", count: 3 },
    ]);
  });

  it("excludes the Leader from the stats and reports ids missing from the atlas", () => {
    const withExtras = computeDeckStats([...deck, { id: "T-LC", copies: 1 }, { id: "ZZ-999", copies: 2 }], atlas, "T-LC");
    expect(withExtras.total).toBe(16);
    expect(withExtras.unknown).toBe(2);
    expect(withExtras.costCurve[0]!.total).toBe(0);
  });

  it("maps alt-art ids and stray case or whitespace to the base card", () => {
    const merged = computeDeckStats(
      [
        { id: " t-c1_P1 ", copies: 2 },
        { id: "T-C1", copies: 1 },
        { id: "T-C2_r3", copies: 1 },
      ],
      atlas,
      " t-lc_p1",
    );
    expect(merged.unknown).toBe(0);
    expect(merged.total).toBe(4);
    expect(merged.costCurve[1]!.total).toBe(3);
    expect(merged.leader?.id).toBe("T-LC");
    expect(normalizeStatsCardId("OP01-016_p2")).toBe("OP01-016");
  });

  it("flags cards that share no color with the Leader but not multicolor cards that share one", () => {
    // T-C4 is green/red, so it shares red with the red/blue Leader.
    expect(stats.leader?.offColorIds).toEqual(["T-C3", "T-E2"]);
  });
});

describe("leader deck rules", () => {
  it("flags max_cost and only_trait separately, allowing the exact cost limit", () => {
    const s = computeDeckStats(
      [
        { id: "T-C5", copies: 4 },
        { id: "T-C6", copies: 1 },
        { id: "T-S1", copies: 1 },
        { id: "T-C3", copies: 1 },
      ],
      atlas,
      "T-LA",
    );
    expect(s.leader?.ruleViolations).toEqual([
      { rule: "max_cost:5", cardIds: ["T-C3", "T-C6"] },
      { rule: "only_trait:Straw Hat Crew", cardIds: ["T-C3", "T-S1"] },
    ]);
  });

  it("only applies no_events_cost_ge to Events at or above the cost", () => {
    const s = computeDeckStats(
      [
        { id: "T-E1", copies: 1 },
        { id: "T-E2", copies: 1 },
        { id: "T-C5", copies: 1 },
      ],
      atlas,
      "T-LB",
    );
    expect(s.leader?.ruleViolations).toEqual([{ rule: "no_events_cost_ge:3", cardIds: ["T-E1"] }]);
  });
});

describe("counters printed outside the counter box", () => {
  const cards: StatsAtlas = {
    "X-ROCKS": { n: "Rocks.D.Xebec", t: "character", col: ["blue"], cost: 10, pow: 12000, tr: ["Rocks Pirates"], hc: 2000 },
    "X-WANO0": { n: "Wano 0", t: "character", col: ["red"], cost: 3, tr: ["Land of Wano"] },
    "X-WANO1": { n: "Wano 1k", t: "character", col: ["red"], cost: 3, ctr: 1000, tr: ["Land of Wano"] },
    "X-NAVY0": { n: "Navy 0", t: "character", col: ["red"], cost: 3, tr: ["Navy"] },
    "X-STAGE": { n: "Stage", t: "stage", col: ["green"], cost: 1 },
    "X-EV": { n: "Guard Point", t: "event", col: ["red"], cost: 1, tm: ["Counter"], ec: 4000 },
    "X-LP": { t: "leader", col: ["red", "blue", "green"] },
    "X-LW": { t: "leader", col: ["red"], gc: [{ v: 2000, t: ["character"], tr: ["Land of Wano"], nc: 1 }] },
    "X-LS": { t: "leader", col: ["green", "red"], gc: [{ v: 3000, t: ["stage"] }] },
  };

  it("counts Rocks.D.Xebec's +2000 Counter in hand by default and names it (#265)", () => {
    const s = computeDeckStats([{ id: "X-ROCKS", copies: 4 }, { id: "X-NAVY0", copies: 4 }], cards, "X-LP");
    expect(s.counter.totalCounter).toBe(8000);
    expect(s.counter.average).toBe(1000);
    expect(s.counter.c2000).toBe(4);
    expect(s.counter.granted).toEqual([{ id: "X-ROCKS", name: "Rocks.D.Xebec", copies: 4, value: 2000, source: "self" }]);
  });

  it("applies a Leader's counter grant only to the named trait and type, and only without a printed counter (#265)", () => {
    const wano = computeDeckStats(
      [{ id: "X-WANO0", copies: 2 }, { id: "X-WANO1", copies: 2 }, { id: "X-NAVY0", copies: 2 }, { id: "X-STAGE", copies: 1 }],
      cards,
      "X-LW",
    );
    // Wano 0 -> 2000, Wano 1k keeps its printed 1000, Navy and the Stage stay at 0.
    expect(wano.counter.totalCounter).toBe(6000);
    expect(wano.counter.granted).toEqual([{ id: "X-WANO0", name: "Wano 0", copies: 2, value: 2000, source: "leader" }]);
    const stages = computeDeckStats([{ id: "X-STAGE", copies: 2 }, { id: "X-NAVY0", copies: 2 }], cards, "X-LS");
    expect(stages.counter.totalCounter).toBe(6000);
  });

  it("adds [Counter] events' base +power only when event counters are on (#265)", () => {
    const deck = [{ id: "X-EV", copies: 2 }, { id: "X-NAVY0", copies: 2 }];
    const off = computeDeckStats(deck, cards, "X-LP");
    expect(off.counter).toMatchObject({ totalCounter: 0, none: 4, eventsCounted: false });
    const on = computeDeckStats(deck, cards, "X-LP", { eventCounters: true });
    expect(on.counter).toMatchObject({ totalCounter: 8000, average: 2000, none: 2, other: 2, eventsCounted: true });
    expect(on.counter.granted).toEqual([]);
  });
});
