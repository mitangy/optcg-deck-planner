import { describe, expect, it } from "vitest";
import { deckRemainingMarket, remainingCostForCard, shoppingShownPrice, splitStillNeed } from "./deckCost";

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
    expect(remainingCostForCard({ still_need: 4, market_price: 1.5, alt_arts: alts })).toBe(51.5);
  });

  it("caps picks at what is still needed, in list order", () => {
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

describe("remainingCostForCard with owned picked alt arts (#908)", () => {
  it("does not buy or price an owned picked alt copy again", () => {
    const owned = [{ product_id: 100, wanted: 2, owned: 2, market_price: 10 }];
    expect(remainingCostForCard({ still_need: 2, market_price: 1, alt_arts: owned })).toBe(2);
    expect(splitStillNeed({ still_need: 2, market_price: 1, alt_arts: owned })).toMatchObject({
      altCopies: 0,
      baseCopies: 2,
    });
  });

  it("still buys the picked copies that are not owned as the alt", () => {
    const alts = [{ product_id: 100, wanted: 2, owned: 1, market_price: 10 }];
    expect(remainingCostForCard({ still_need: 3, market_price: 1, alt_arts: alts })).toBe(12);
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

describe("shoppingShownPrice", () => {
  it("shoppingShownPrice prices picked alt arts and falls back to market price when nothing is needed (#926)", () => {
    const alts = [{ wanted: 1, market_price: 10 }];
    expect(shoppingShownPrice({ still_need: 2, market_price: 1, alt_arts: alts })).toBe(11);
    expect(shoppingShownPrice({ still_need: 0, market_price: 1, alt_arts: alts })).toBe(1);
    expect(shoppingShownPrice({ still_need: 0, market_price: null, alt_arts: alts })).toBeNull();
  });

  it("shoppingShownPrice uses the shown alt art's price when nothing is needed (#928)", () => {
    const alts = [{ product_id: 201, owned: 0, wanted: 0, market_price: 14.99 }];
    expect(shoppingShownPrice({ still_need: 0, market_price: 1.25, alt_arts: alts, display_art: 201 })).toBe(14.99);
    expect(shoppingShownPrice({ still_need: 0, market_price: 1.25, alt_arts: alts, display_art: 0 })).toBe(1.25);
    expect(shoppingShownPrice({ still_need: 1, market_price: 1.25, alt_arts: alts, display_art: 201 })).toBe(1.25);
  });
});
