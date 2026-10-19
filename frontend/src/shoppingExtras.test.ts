import { describe, expect, it } from "vitest";
import { nextExtraTarget, totalOwnedCopies } from "./shoppingExtras";

describe("nextExtraTarget (#525)", () => {
  it("+ on a card that is covered targets one copy beyond what is owned", () => {
    expect(nextExtraTarget({ owned: 2, deckNeed: 0, extraQty: 0, stillNeed: 0 }, 1)).toBe(3);
  });

  it("+ buys one more than the list already wants, counting owned copies", () => {
    // Owned 1, target 3 (2 to buy) -> 3 to buy means target 4.
    expect(nextExtraTarget({ owned: 1, deckNeed: 0, extraQty: 3, stillNeed: 2 }, 1)).toBe(4);
  });

  it("+ on a deck-driven card goes above the deck need", () => {
    expect(nextExtraTarget({ owned: 0, deckNeed: 4, extraQty: 0, stillNeed: 4 }, 1)).toBe(5);
  });

  it("− lowers the target by one copy to buy", () => {
    expect(nextExtraTarget({ owned: 1, deckNeed: 0, extraQty: 4, stillNeed: 3 }, -1)).toBe(3);
  });

  it("− removes the extra once owned copies or decks already cover the lower target", () => {
    expect(nextExtraTarget({ owned: 2, deckNeed: 0, extraQty: 3, stillNeed: 1 }, -1)).toBe(0);
    expect(nextExtraTarget({ owned: 0, deckNeed: 4, extraQty: 5, stillNeed: 5 }, -1)).toBe(0);
  });

  it("− stops above the deck need instead of dropping below it", () => {
    expect(nextExtraTarget({ owned: 0, deckNeed: 2, extraQty: 5, stillNeed: 5 }, -1)).toBe(4);
  });

  it("− never goes below zero", () => {
    expect(nextExtraTarget({ owned: 0, deckNeed: 0, extraQty: 0, stillNeed: 0 }, -1)).toBe(0);
  });
});

describe("alt art copies count as owned when adding to Master Shopping (#626)", () => {
  // 0 base + 2 alt copies, no deck: the backend's still_need is max(0, need - owned - alts_owned).
  const altOnly = { owned: 0, alts_owned: 2 };

  it("Add on a card owned only as alt arts targets one beyond the alts, leaving 1 to buy", () => {
    const owned = totalOwnedCopies(altOnly);
    const target = nextExtraTarget({ owned, deckNeed: 0, extraQty: 0, stillNeed: 0 }, 1);
    expect(target).toBe(3);
    expect(Math.max(0, target - owned)).toBe(1);
  });

  it("\u2212 from 2 to buy with alt copies owned leaves 1 to buy, not 0", () => {
    const owned = totalOwnedCopies(altOnly);
    // Target 4 = 2 alts + 2 to buy.
    const target = nextExtraTarget({ owned, deckNeed: 0, extraQty: 4, stillNeed: 2 }, -1);
    expect(target).toBe(3);
    expect(target - owned).toBe(1);
  });

  it("totalOwnedCopies adds alt copies to base copies and tolerates a missing alts_owned", () => {
    expect(totalOwnedCopies({ owned: 1, alts_owned: 2 })).toBe(3);
    expect(totalOwnedCopies({ owned: 1 })).toBe(1);
  });
});
