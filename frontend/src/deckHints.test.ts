import { describe, expect, it } from "vitest";
import { computeDeckHints, deckDelta, splitDismissed, type HintOptions } from "./deckHints";
import { computeDeckStats, type DeckStatsCard, type StatsAtlas, type StatsAtlasCard } from "./deckStats";

const ch = (over: Partial<StatsAtlasCard>): StatsAtlasCard => ({ t: "character", col: ["red"], cost: 6, ...over });

// A legal, healthy 50-card deck (see `base`). Each test breaks exactly one thing.
const atlas: StatsAtlas = {
  "T-L": { n: "Luffy", t: "leader", col: ["red"], lt: ["Crew"] },
  "T-LR": { n: "Zoro", t: "leader", col: ["red"], rules: ["max_cost:5"] },
  "T-LB": { n: "Nami", t: "leader", col: ["red", "green"], rules: ["only_trait:Crew", "no_events_cost_ge:5"] },
  "T-E1": ch({ cost: 1, ctr: 1000, tr: ["Crew"] }),
  "T-E2": ch({ cost: 2, ctr: 1000, tr: ["Crew"] }),
  "T-E3": ch({ cost: 3, ctr: 1000, tr: ["Crew"] }),
  "T-M1": ch({ cost: 4, ctr: 2000 }),
  "T-M2": ch({ cost: 4, ctr: 2000 }),
  "T-M3": ch({ cost: 4, ctr: 2000 }),
  "T-N1": ch({ cost: 4 }),
  "T-P1": ch({ cost: 5, ctr: 1000, tr: ["Crew"] }),
  "T-P2": ch({ cost: 5, ctr: 1000 }),
  "T-CE": { t: "event", col: ["red"], cost: 5, tm: ["Counter"] },
  "T-H1": ch({ cost: 7, ctr: 1000 }),
  "T-H2": ch({ cost: 7, ctr: 1000 }),
  "T-H3": ch({ cost: 12 }),
  "T-X1": ch({}),
  "T-X2": ch({}),
  "T-BLUE": { t: "character", col: ["blue"], cost: 6 },
  "T-SPLIT": { t: "character", col: ["blue", "red"], cost: 6 },
  "T-S1": ch({ tr: ["Rare"], srch: [{ look: 5, filter: { traits: ["Rare"] } }] }),
  "T-S2": ch({ srch: [{ look: 5, filter: { mystery: 1 } }] }),
  "T-S4": ch({ tr: ["Fresh"], srch: [{ look: 5, filter: { traits: ["Fresh"] } }] }),
  "T-FR1": ch({ tr: ["Fresh"] }),
  "T-FR2": ch({ tr: ["Fresh"] }),
  "T-R1": ch({ tr: ["Rare"] }),
  "T-R2": ch({ tr: ["Rare"] }),
  "T-R3": ch({ tr: ["Rare"] }),
  ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`T-F${i + 1}`, ch({ ctr: 1000 })])),
};

const leaderRow = (id = "T-L"): DeckStatsCard => ({ id, copies: 1 });
const base = (): DeckStatsCard[] => [
  leaderRow(),
  { id: "T-E1", copies: 4 }, { id: "T-E2", copies: 4 }, { id: "T-E3", copies: 4 },
  { id: "T-M1", copies: 4 }, { id: "T-M2", copies: 4 }, { id: "T-M3", copies: 4 },
  { id: "T-P1", copies: 4 }, { id: "T-P2", copies: 4 }, { id: "T-CE", copies: 4 },
  { id: "T-H1", copies: 4 }, { id: "T-H2", copies: 4 },
  { id: "T-X1", copies: 4 }, { id: "T-X2", copies: 2 },
];
const withCopies = (cards: DeckStatsCard[], id: string, copies: number) =>
  [...cards.filter((c) => c.id !== id), ...(copies > 0 ? [{ id, copies }] : [])];

const hintsFor = (cards: DeckStatsCard[], opts?: HintOptions, leader = "T-L") => computeDeckHints(computeDeckStats(cards, atlas, leader), cards, atlas, leader, opts);
const idsFor = (cards: DeckStatsCard[], opts?: HintOptions, leader = "T-L") => hintsFor(cards, opts, leader).map((h) => h.id);

/** `n` copies of cost-6 filler cards, at most 4 of each. */
const filler = (n: number): DeckStatsCard[] => Array.from({ length: Math.ceil(n / 4) }, (_, i) => ({ id: `T-F${i + 1}`, copies: Math.min(4, n - i * 4) }));

describe("computeDeckHints", () => {
  it("has nothing to say about a healthy 50-card deck", () => {
    expect(idsFor(base(), { finished: true })).toEqual([]);
  });

  describe("card count", () => {
    it("flags anything but exactly 50 once finished, never counting the leader", () => {
      expect(idsFor(base(), { finished: true })).not.toContain("count");
      expect(idsFor(withCopies(base(), "T-X2", 1), { finished: true })).toContain("count");
      expect(idsFor(withCopies(base(), "T-X2", 3), { finished: true })).toContain("count");
    });

    it("does not nag a deck still being built, unless it is over 50", () => {
      expect(idsFor(withCopies(base(), "T-X2", 1))).not.toContain("count");
      expect(idsFor(withCopies(base(), "T-X2", 3))).toContain("count");
      const hint = hintsFor(withCopies(base(), "T-X2", 3)).find((h) => h.id === "count")!;
      expect(hint.title).toBe("51 of 50 cards");
    });

    it("counts alt arts of one card number together", () => {
      const cards = [...withCopies(base(), "T-X2", 0), { id: "T-X2", copies: 1 }, { id: "T-X2_p1", copies: 1 }];
      expect(idsFor(cards, { finished: true })).not.toContain("count");
    });
  });

  describe("copy limit", () => {
    it("allows 4 copies and flags 5, merging alt arts", () => {
      expect(idsFor(base())).not.toContain("copies");
      const five = [...withCopies(base(), "T-X1", 2), { id: "T-X1_p1", copies: 3 }];
      const hint = hintsFor(five).find((h) => h.id === "copies")!;
      expect(hint.tier).toBe("rule");
      expect(hint.cardIds).toEqual(["T-X1"]);
    });

    it("does not treat the leader row as a main-deck copy", () => {
      const cards = [{ id: "T-L", copies: 5 }, ...base().slice(1)];
      expect(idsFor(cards)).not.toContain("copies");
    });
  });

  describe("leader colors and rules", () => {
    it("lists cards sharing no color with the leader, but not multicolor cards that share one", () => {
      const cards = [...base(), { id: "T-SPLIT", copies: 1 }, { id: "T-BLUE", copies: 2 }];
      const hint = hintsFor(cards).find((h) => h.id === "offcolor")!;
      expect(hint.cardIds).toEqual(["T-BLUE"]);
      expect(hint.title).toBe("1 off-color card");
    });

    it("turns the leader's deck rules into readable warnings with the offending cards", () => {
      const cards = [leaderRow("T-LR"), ...base().slice(1)];
      const hint = hintsFor(cards, undefined, "T-LR").find((h) => h.id === "leader-rule:max_cost:5")!;
      expect(hint.tier).toBe("rule");
      expect(hint.detail).toBe("Zoro cannot include cards with a cost of 6 or more.");
      expect(hint.cardIds).toEqual(["T-H1", "T-H2", "T-X1", "T-X2"]);
    });

    it("words each kind of leader rule", () => {
      const cards = [leaderRow("T-LB"), ...base().slice(1)];
      const byId = new Map(hintsFor(cards, undefined, "T-LB").map((h) => [h.id, h.detail]));
      expect(byId.get("leader-rule:only_trait:Crew")).toBe("Nami can only include {Crew} type cards.");
      expect(byId.get("leader-rule:no_events_cost_ge:5")).toBe("Nami cannot include Events with a cost of 5 or more.");
    });
  });

  describe("shape", () => {
    it("wants at least 10 plays at cost 1-3", () => {
      expect(idsFor(withCopies(base(), "T-E3", 2))).not.toContain("thin-early"); // 4 + 4 + 2 = 10
      expect(idsFor(withCopies(base(), "T-E3", 1))).toContain("thin-early"); // 9
      // cost 1 and cost 3 both count: dropping either end of the range makes the base deck thin
      expect(idsFor(base())).not.toContain("thin-early");
    });

    it("allows 8 cards at cost 7+ and flags 9, folding big costs in", () => {
      expect(idsFor(base())).not.toContain("top-heavy");
      expect(idsFor([...base(), { id: "T-H3", copies: 1 }])).toContain("top-heavy");
      // cost 6 is not late
      expect(idsFor([...base(), { id: "T-X2", copies: 1 }])).not.toContain("top-heavy");
    });

    it("flags an average counter under 1000 but not exactly 1000", () => {
      // base total counter 52000 over 50. Swap 2000-counter cards for blank ones (-2000 each).
      const swap = (n: number) => [...withCopies(withCopies(base(), "T-M3", 4 - n), "T-N1", n)];
      expect(idsFor(swap(1))).not.toContain("low-defense"); // 50000 / 50 = 1000
      expect(idsFor(swap(2))).toContain("low-defense"); // 48000 / 50 = 960
    });

    it("flags a deck with no Counter events even when the average is fine", () => {
      const noEvents = [...withCopies(base(), "T-CE", 0), { id: "T-N1", copies: 4 }];
      const stats = computeDeckStats(noEvents, atlas, "T-L");
      expect(stats.counter.average).toBeGreaterThanOrEqual(1000);
      expect(idsFor(noEvents)).toContain("low-defense");
    });

    it("does not treat having no Blockers as a problem", () => {
      expect(hintsFor(base(), { finished: true }).filter((h) => /blocker/i.test(h.title + h.detail))).toEqual([]);
    });

    it("stays quiet until 40 cards are counted", () => {
      const thin = (n: number) => filler(n); // all cost 6, no Counter events: every shape hint applies
      expect(idsFor(thin(39))).not.toContain("thin-early");
      expect(idsFor(thin(39))).not.toContain("low-defense");
      expect(idsFor(thin(40))).toContain("thin-early");
      expect(idsFor(thin(40))).toContain("low-defense");
    });
  });

  describe("searchers", () => {
    // 50 counted cards, one searcher (look 5) and `rare` other Rare cards: pool 49.
    const searcherDeck = (rare: number): DeckStatsCard[] => {
      const rares = ["T-R1", "T-R2", "T-R3"].map((id, i) => ({ id, copies: Math.max(0, Math.min(4, rare - i * 4)) })).filter((c) => c.copies > 0);
      return [{ id: "T-S1", copies: 1 }, ...rares, ...filler(49 - rare)];
    };

    it("flags a searcher hitting under 75% and names the odds", () => {
      const hint = hintsFor(searcherDeck(11)).find((h) => h.id === "weak-searcher:T-S1")!; // 73.7%
      expect(hint.tier).toBe("shape");
      expect(hint.title).toBe("Weak searcher: T-S1 hits only 11 cards, 74%");
      expect(hint.cardIds).toEqual(["T-S1"]);
      expect(idsFor(searcherDeck(12))).not.toContain("weak-searcher:T-S1"); // 77.1%
    });

    it("calls a filter dead at 3 other matches or fewer, and only weak above that", () => {
      const dead = hintsFor(searcherDeck(3));
      expect(dead.map((h) => h.id)).toContain("dead-filter:T-S1");
      expect(dead.map((h) => h.id)).not.toContain("weak-searcher:T-S1");
      const weak = idsFor(searcherDeck(4));
      expect(weak).toContain("weak-searcher:T-S1");
      expect(weak).not.toContain("dead-filter:T-S1");
    });

    it("does not count the searcher itself as a hit", () => {
      // S1 is Rare; with 3 other Rare cards its filter still matches only 3, not 4
      expect(hintsFor(searcherDeck(3)).find((h) => h.id === "dead-filter:T-S1")!.detail).toContain("3 other cards");
    });

    it("stays quiet about searchers until 40 cards are counted", () => {
      const small = (n: number): DeckStatsCard[] => [{ id: "T-S1", copies: 1 }, ...filler(n - 1)];
      expect(idsFor(small(39))).not.toContain("dead-filter:T-S1");
      expect(idsFor(small(40))).toContain("dead-filter:T-S1");
    });

    it("does not guess when the filter cannot be evaluated", () => {
      const cards = [{ id: "T-S2", copies: 1 }, ...filler(49)];
      expect(idsFor(cards).filter((id) => id.includes("T-S2"))).toEqual([]);
    });
  });

  describe("leader synergy", () => {
    it("reports how many cards carry a trait the leader names, only when short of the target", () => {
      expect(idsFor(base())).not.toContain("synergy:Crew"); // 16 cards carry it
      const hint = hintsFor(withCopies(base(), "T-P1", 3)).find((h) => h.id === "synergy:Crew")!; // 15
      expect(hint.tier).toBe("synergy");
      expect(hint.title).toBe("Leader supports {Crew}: 15 of 50 cards have it");
    });

    it("stays quiet until 40 cards are counted", () => {
      expect(idsFor(filler(39))).not.toContain("synergy:Crew");
      expect(idsFor(filler(40))).toContain("synergy:Crew");
    });

    it("counts copies, not distinct cards", () => {
      const cards = [...withCopies(withCopies(base(), "T-E1", 1), "T-P1", 1), { id: "T-E1_p1", copies: 1 }, { id: "T-X1", copies: 4 }];
      expect(hintsFor(cards).find((h) => h.id === "synergy:Crew")!.title).toContain(": 11 of");
    });
  });

  it("orders rule, then shape, then synergy, whatever order they were found in", () => {
    // S1 (3 other Rare cards) is a dead filter (synergy) found before S4 (5 Fresh hits at ~36%) is weak (shape).
    const cards: DeckStatsCard[] = [
      leaderRow(), { id: "T-S1", copies: 1 }, { id: "T-S4", copies: 1 }, { id: "T-R1", copies: 3 },
      { id: "T-FR1", copies: 4 }, { id: "T-FR2", copies: 1 }, { id: "T-BLUE", copies: 1 }, ...filler(39),
    ];
    const hints = hintsFor(cards);
    const at = (id: string) => hints.findIndex((h) => h.id === id);
    expect(at("dead-filter:T-S1")).toBeGreaterThan(-1);
    expect(at("weak-searcher:T-S4")).toBeGreaterThan(-1);
    expect(at("offcolor")).toBeLessThan(at("weak-searcher:T-S4"));
    expect(at("weak-searcher:T-S4")).toBeLessThan(at("dead-filter:T-S1"));
  });
});

describe("splitDismissed", () => {
  const hints = [
    { id: "a", tier: "rule" as const, title: "A", detail: "" },
    { id: "b", tier: "shape" as const, title: "B", detail: "" },
  ];
  it("separates dismissed hints and ignores ids that are not current hints", () => {
    const r = splitDismissed(hints, ["b", "gone"]);
    expect(r.visible.map((h) => h.id)).toEqual(["a"]);
    expect(r.dismissed.map((h) => h.id)).toEqual(["b"]);
  });
});

describe("deckDelta", () => {
  it("reports the touched cost bucket and the average counter", () => {
    const before = withCopies(withCopies(base(), "T-X2", 0), "T-M1", 3);
    const after = withCopies(before, "T-M1", 4);
    expect(deckDelta(before, after, "T-M1", atlas, "T-L")).toBe("Cost 4: 11 → 12 · Avg counter 1.06k → 1.08k");
  });

  it("works for removals", () => {
    const before = withCopies(base(), "T-X2", 0);
    const after = withCopies(before, "T-M1", 3);
    expect(deckDelta(before, after, "T-M1", atlas, "T-L")).toBe("Cost 4: 12 → 11 · Avg counter 1.08k → 1.06k");
  });

  it("shows a new hint ahead of the stats", () => {
    const before = withCopies(base(), "T-X2", 0); // 48 cards
    const after = [...before, { id: "T-X1_p1", copies: 1 }]; // 5th copy of T-X1
    expect(deckDelta(before, after, "T-X1", atlas, "T-L")).toBe("New hint: Over 4 copies · Cost 6: 4 → 5");
  });

  it("shows a cleared hint", () => {
    const after = withCopies(base(), "T-X2", 0);
    const before = [...after, { id: "T-X1_p1", copies: 1 }];
    expect(deckDelta(before, after, "T-X1", atlas, "T-L")).toBe("Cleared: Over 4 copies · Cost 6: 5 → 4");
  });

  it("says nothing when no tracked stat moved", () => {
    const before = withCopies(base(), "T-X2", 0);
    expect(deckDelta(before, [...before, { id: "T-UNKNOWN", copies: 1 }], "T-UNKNOWN", atlas, "T-L")).toBeNull();
  });
});
