import { describe, expect, it } from "vitest";
import {
  atLeastWithMulligan,
  cardsSeen,
  cardLabel,
  countHits,
  defaultHitCardId,
  deckEntries,
  groupMatches,
  hypergeomAtLeast,
  MAX_ODDS_DECK,
  matchesFilter,
  oddsByTurn,
  searcherOdds,
  type HitGroup,
} from "./drawOdds";
import type { StatsAtlas, StatsAtlasCard } from "./deckStats";

const pct = (p: number) => Math.round(p * 1000) / 10;

describe("hypergeomAtLeast", () => {
  it("matches the closed form for 4 copies in 50 cards", () => {
    // 1 - C(46,5)/C(50,5) and 1 - C(46,7)/C(50,7)
    expect(pct(hypergeomAtLeast(50, 4, 5, 1))).toBe(35.3);
    expect(pct(hypergeomAtLeast(50, 4, 7, 1))).toBe(46.4);
  });
  it("gives no odds for a deck too large to tabulate instead of growing the table (#SEC)", () => {
    expect(hypergeomAtLeast(MAX_ODDS_DECK + 1, 4, 5, 1)).toBeNaN();
    expect(hypergeomAtLeast(MAX_ODDS_DECK, 4, 5, 1)).toBeGreaterThan(0);
  });
  it("needs two hits for k=2", () => {
    // 1 - P(0) - P(1) with 4 hits, 5 cards of 50
    expect(pct(hypergeomAtLeast(50, 4, 5, 2))).toBe(4.5);
  });
  it("is certain with k<=0 or when every card is a hit", () => {
    expect(hypergeomAtLeast(50, 4, 5, 0)).toBe(1);
    expect(hypergeomAtLeast(50, 50, 5, 5)).toBeCloseTo(1, 12);
  });
});

describe("turn model", () => {
  it("going first skips the turn-1 draw; going second draws on turn 1", () => {
    expect(cardsSeen(1, true)).toBe(5);
    expect(cardsSeen(3, true)).toBe(7);
    expect(cardsSeen(1, false)).toBe(6);
    expect(cardsSeen(3, false)).toBe(8);
  });
  it("turns the model into per-turn odds", () => {
    const first = oddsByTurn({ deckSize: 50, hits: 4, atLeast: 1, goingFirst: true, mulligan: false });
    expect(first).toHaveLength(6);
    expect(pct(first[0]!)).toBe(35.3);
    expect(pct(first[2]!)).toBe(46.4);
    const second = oddsByTurn({ deckSize: 50, hits: 8, atLeast: 1, goingFirst: false, mulligan: false });
    expect(pct(second[0]!)).toBe(67);
  });
});

describe("mulligan", () => {
  it("k=1 is p5 + (1 - p5) * p(seen)", () => {
    const p5 = hypergeomAtLeast(50, 4, 5, 1);
    expect(atLeastWithMulligan(50, 4, 5, 1)).toBeCloseTo(p5 + (1 - p5) * p5, 12);
    expect(pct(atLeastWithMulligan(50, 4, 5, 1))).toBe(58.1);
    const p7 = hypergeomAtLeast(50, 4, 7, 1);
    expect(atLeastWithMulligan(50, 4, 7, 1)).toBeCloseTo(p5 + (1 - p5) * p7, 12);
  });
  it("k=2 conditions the remaining draws on the hits already in the opener", () => {
    // Brute force over the opener: keep with j>=1 hits, redraw on 0.
    const N = 20, K = 5, seen = 8;
    const c = (n: number, r: number): number => (r < 0 || r > n ? 0 : r === 0 ? 1 : (c(n - 1, r - 1) * n) / r);
    const pmf = (n: number, h: number, d: number, j: number) => (c(h, j) * c(n - h, d - j)) / c(n, d);
    let want = 0;
    for (let j = 1; j <= 5; j++) {
      let tail = 0;
      for (let x = Math.max(0, 2 - j); x <= 3; x++) tail += pmf(N - 5, K - j, seen - 5, x);
      want += pmf(N, K, 5, j) * tail;
    }
    let fresh = 0;
    for (let x = 2; x <= seen; x++) fresh += pmf(N, K, seen, x);
    want += pmf(N, K, 5, 0) * fresh;
    expect(atLeastWithMulligan(N, K, seen, 2)).toBeCloseTo(want, 10);
    // A mulligan only rescues empty openers, so k=2 gains less than plain odds would suggest.
    expect(atLeastWithMulligan(N, K, seen, 2)).toBeGreaterThan(hypergeomAtLeast(N, K, seen, 2));
  });
});

const atlas: StatsAtlas = {
  L1: { n: "Leader", t: "leader", col: ["red"] },
  A: { n: "Alpha", t: "character", col: ["red"], cost: 2, pow: 3000, ctr: 2000, tr: ["Straw Hat Crew"], kw: ["Blocker"] },
  B: { n: "Beta", t: "character", col: ["green"], cost: 5, pow: 6000, tr: ["Navy", "Straw Hat Fans"], kw: ["Rush"], trg: 1 },
  C: { n: "Gamma", al: ["Gamma Alias"], t: "event", col: ["red", "blue"], cost: 1, ctr: 1000 },
  D: { n: "Delta", t: "stage", col: ["blue"], cost: 3, tr: ["Straw Hat Crew"] },
};

describe("hit groups", () => {
  const entries = deckEntries(
    [{ id: "A", copies: 4 }, { id: "A_p1", copies: 1 }, { id: "B", copies: 3 }, { id: "C", copies: 2 }, { id: "D", copies: 1 }, { id: "L1", copies: 1 }, { id: "ZZ", copies: 9 }],
    atlas,
  );
  it("merges alt arts and skips leaders and unknown ids", () => {
    expect(entries.map((e) => [e.id, e.copies])).toEqual([["A", 5], ["B", 3], ["C", 2], ["D", 1]]);
  });
  const hits = (g: HitGroup) => countHits(entries, g);
  it("counter 2000 and blockers select only the matching cards", () => {
    expect(hits({ kind: "counter2000" })).toBe(5);
    expect(hits({ kind: "blocker" })).toBe(5);
  });
  it("cost <= N is inclusive", () => {
    expect(hits({ kind: "costMax", max: 2 })).toBe(7);
    expect(hits({ kind: "costMax", max: 1 })).toBe(2);
    expect(hits({ kind: "costMax", max: 5 })).toBe(11);
  });
  it("trait groups and custom sets count copies", () => {
    expect(hits({ kind: "trait", trait: "Straw Hat Crew" })).toBe(6);
    expect(hits({ kind: "custom", ids: ["B", "C"] })).toBe(5);
    expect(hits({ kind: "card", id: "B" })).toBe(3);
    expect(groupMatches({ kind: "card", id: "B" }, "A", atlas.A!)).toBe(false);
  });
  it("defaults to the highest-copy card, ties by id", () => {
    expect(defaultHitCardId(entries)).toBe("A");
    expect(defaultHitCardId(entries.map((e) => ({ ...e, copies: 2 })))).toBe("A");
    expect(defaultHitCardId([])).toBeNull();
  });
});

describe("matchesFilter", () => {
  const ch = (over: Partial<StatsAtlasCard>): StatsAtlasCard => ({ n: "X", t: "character", col: ["red"], cost: 3, pow: 4000, ...over });
  it("types", () => {
    expect(matchesFilter(ch({}), { types: ["character"] })).toBe(true);
    expect(matchesFilter(ch({}), { types: ["event", "stage"] })).toBe(false);
  });
  it("traits match any listed trait exactly", () => {
    expect(matchesFilter(ch({ tr: ["Navy"] }), { traits: ["Pirates", "Navy"] })).toBe(true);
    expect(matchesFilter(ch({ tr: ["Navy Officer"] }), { traits: ["Navy"] })).toBe(false);
  });
  it("traitIncludes matches substrings", () => {
    expect(matchesFilter(ch({ tr: ["Navy Officer"] }), { traitIncludes: ["Navy"] })).toBe(true);
    expect(matchesFilter(ch({ tr: ["Marine"] }), { traitIncludes: ["Navy"] })).toBe(false);
  });
  it("names match the printed name or an alias; notNames excludes both", () => {
    const c = ch({ n: "Gamma", al: ["Alias"] });
    expect(matchesFilter(c, { names: ["Alias"] })).toBe(true);
    expect(matchesFilter(c, { names: ["Other"] })).toBe(false);
    expect(matchesFilter(c, { notNames: ["Gamma"] })).toBe(false);
    expect(matchesFilter(c, { notNames: ["Alias"] })).toBe(false);
    expect(matchesFilter(c, { notNames: ["Other"] })).toBe(true);
  });
  it("colors match any listed color", () => {
    expect(matchesFilter(ch({ col: ["red", "blue"] }), { colors: ["blue"] })).toBe(true);
    expect(matchesFilter(ch({ col: ["red"] }), { colors: ["blue"] })).toBe(false);
  });
  it("cost and power comparisons honor every operator we read", () => {
    expect(matchesFilter(ch({ cost: 4 }), { cost: { op: ">=", value: 4 } })).toBe(true);
    expect(matchesFilter(ch({ cost: 3 }), { cost: { op: ">=", value: 4 } })).toBe(false);
    expect(matchesFilter(ch({ cost: 4 }), { cost: { op: "<=", value: 4 } })).toBe(true);
    expect(matchesFilter(ch({ cost: 5 }), { cost: { op: "<=", value: 4 } })).toBe(false);
    expect(matchesFilter(ch({ cost: 2 }), { cost: { op: "==", value: 2 } })).toBe(true);
    expect(matchesFilter(ch({ cost: 3 }), { cost: { op: "==", value: 2 } })).toBe(false);
    expect(matchesFilter(ch({ cost: 1 }), { cost: { op: "==", value: 2 } })).toBe(false);
    expect(matchesFilter(ch({ pow: 6000 }), { power: { op: "==", value: 6000 } })).toBe(true);
    expect(matchesFilter(ch({ pow: 1000 }), { power: { op: "<=", value: 2000 } })).toBe(true);
    expect(matchesFilter(ch({ pow: 3000 }), { power: { op: "<=", value: 2000 } })).toBe(false);
  });
  it("hasTrigger compares against the printed Trigger", () => {
    expect(matchesFilter(ch({ trg: 1 }), { hasTrigger: true })).toBe(true);
    expect(matchesFilter(ch({}), { hasTrigger: true })).toBe(false);
  });
  it("any is an OR and all is an AND of sub-filters", () => {
    const f = { any: [{ names: ["Sanji"] }, { types: ["event"] }] };
    expect(matchesFilter(ch({ n: "Sanji" }), f)).toBe(true);
    expect(matchesFilter(ch({ t: "event" }), f)).toBe(true);
    expect(matchesFilter(ch({}), f)).toBe(false);
    const range = { all: [{ cost: { op: ">=", value: 2 } }, { cost: { op: "<=", value: 8 } }] };
    expect(matchesFilter(ch({ cost: 5 }), range)).toBe(true);
    expect(matchesFilter(ch({ cost: 9 }), range)).toBe(false);
    expect(matchesFilter(ch({ cost: 1 }), range)).toBe(false);
  });
  it("requires every key to match", () => {
    expect(matchesFilter(ch({ tr: ["Navy"] }), { traits: ["Navy"], types: ["event"] })).toBe(false);
  });
  it("returns null for keys it cannot evaluate, even when another key already fails", () => {
    expect(matchesFilter(ch({}), { textIncludes: ["[Trigger]"] })).toBeNull();
    expect(matchesFilter(ch({}), { types: ["event"], vanilla: true })).toBeNull();
    expect(matchesFilter(ch({}), { any: [{ types: ["character"] }, { keyword: "blocker" }] })).toBeNull();
    expect(matchesFilter(ch({}), { cost: { op: ">=", value: { of: "x" } } })).toBeNull();
  });
});

describe("searcherOdds", () => {
  const look5 = (filter: Record<string, unknown>): StatsAtlasCard["srch"] => [{ look: 5, filter }];
  const sAtlas: StatsAtlas = {
    S: { n: "Seeker", t: "character", col: ["red"], tr: ["Crew"], srch: look5({ traits: ["Crew"] }) },
    H: { n: "Hit", t: "character", col: ["red"], tr: ["Crew"] },
    M: { n: "Miss", t: "character", col: ["red"], tr: ["Other"] },
    U: { n: "Unknown", t: "character", col: ["red"], srch: look5({ vanilla: true }) },
  };
  const entries = deckEntries([{ id: "S", copies: 4 }, { id: "H", copies: 3 }, { id: "M", copies: 6 }, { id: "U", copies: 1 }], sAtlas);

  it("leaves the searcher's own copy out of the hit count and the deck", () => {
    const row = searcherOdds(entries).find((r) => r.id === "S")!;
    // 4 Seeker + 3 Hit match; the searcher itself is removed: K = 6 of N = 13.
    expect(row.hits).toBe(6);
    expect(row.look).toBe(5);
    expect(row.chance).toBeCloseTo(hypergeomAtLeast(13, 6, 5, 1), 12);
    expect(pct(row.chance!)).toBe(98.4);
  });
  it("does not subtract the searcher when it is not a hit", () => {
    const other: StatsAtlas = { ...sAtlas, S: { ...sAtlas.S!, srch: look5({ traits: ["Other"] }) } };
    const row = searcherOdds(deckEntries([{ id: "S", copies: 3 }, { id: "M", copies: 2 }], other)).find((r) => r.id === "S")!;
    expect(row.hits).toBe(2);
    expect(row.chance).toBe(1);
  });
  it("sorts lowest chance first and reports unknown filters as not estimable", () => {
    const rows = searcherOdds(entries);
    expect(rows.map((r) => r.id)).toEqual(["S", "U"]);
    expect(rows[1]).toMatchObject({ hits: null, chance: null });
    const low = searcherOdds(deckEntries([{ id: "S", copies: 1 }, { id: "H", copies: 1 }, { id: "M", copies: 30 }, { id: "U", copies: 1 }], sAtlas));
    expect(low.map((r) => r.id)).toEqual(["S", "U"]);
    expect(low[0]!.chance).toBeLessThan(0.2);
  });
});

describe("cardLabel", () => {
  it("tells same-named cards apart by cost and code", () => {
    const a = cardLabel("OP01-016", { n: "Nami", t: "character", col: ["red"], cost: 1 }, 4);
    const b = cardLabel("OP05-001", { n: "Nami", t: "character", col: ["red"], cost: 4 }, 2);
    expect(a).toBe("Nami · Cost 1 · OP01-016 (4x)");
    expect(b).toBe("Nami · Cost 4 · OP05-001 (2x)");
  });
  it("keeps cost 0 and omits cost and copies when unknown", () => {
    expect(cardLabel("ST01-014", { n: "Free", t: "event", col: ["red"], cost: 0 })).toBe("Free · Cost 0 · ST01-014");
    expect(cardLabel("X-1", { n: "Lead", t: "leader", col: ["red"] })).toBe("Lead · X-1");
  });
});
