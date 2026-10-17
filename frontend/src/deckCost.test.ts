import { describe, expect, it } from "vitest";
import { deckRemainingMarket, remainingCostForCard } from "./deckCost";

describe("remainingCostForCard", () => {
  it("prices every still-needed copy at the standard price (#625)", () => {
    expect(remainingCostForCard({ still_need: 4, market_price: 1.25 })).toBe(5);
  });

  it("is 0 for a finished card even when it has no price (#625)", () => {
    expect(remainingCostForCard({ still_need: 0, market_price: null })).toBe(0);
  });

  it("returns null when a needed copy has no price (#625)", () => {
    expect(remainingCostForCard({ still_need: 3, market_price: null })).toBeNull();
  });
});

describe("deckRemainingMarket", () => {
  it("sums priced cards and leaves out unpriced and finished ones (#625)", () => {
    const cards = [
      { still_need: 4, market_price: 1 }, // 4
      { still_need: 2, market_price: 3 }, // 6
      { still_need: 2, market_price: null }, // unpriced
      { still_need: 0, market_price: 5 }, // owned
    ];
    expect(deckRemainingMarket(cards)).toBe(10);
  });
});
