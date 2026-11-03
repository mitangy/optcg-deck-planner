import { describe, expect, it } from "vitest";
import { deckRemainingMarket, remainingCostForCard, splitStillNeed } from "./deckCost";

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

describe("remainingCostForCard with picked alt arts (#906)", () => {
  const alts = [
    { wanted: 1, market_price: 10 },
    { wanted: 0, market_price: 99 },
    { wanted: 2, market_price: 20 },
  ];

  it("prices picked alt copies at the alt price and the rest at standard", () => {
    // 1 x 10 + 2 x 20 + 1 standard x 1.5
    expect(remainingCostForCard({ still_need: 4, market_price: 1.5, alt_arts: alts })).toBe(51.5);
  });

  it("caps picks at what is still needed, in list order", () => {
    // 1 x 10 + 1 x 20, nothing left for standard
    expect(remainingCostForCard({ still_need: 2, market_price: 1.5, alt_arts: alts })).toBe(30);
    expect(splitStillNeed({ still_need: 2, market_price: 1.5, alt_arts: alts })).toMatchObject({
      altCopies: 2,
      baseCopies: 0,
    });
  });

  it("is null when a picked alt has no price", () => {
    expect(
      remainingCostForCard({ still_need: 1, market_price: 1, alt_arts: [{ wanted: 1, market_price: null }] }),
    ).toBeNull();
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
