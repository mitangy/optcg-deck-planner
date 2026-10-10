import { describe, expect, it } from "vitest";
import { deckRemainingMarket, remainingCostForCard } from "./deckCost";

const alt = (wanted: number, price: number | null, id = 2) => ({ product_id: id, wanted, market_price: price });

describe("remainingCostForCard", () => {
  it("prices wanted alt copies at the alt price and the rest at standard (#433)", () => {
    expect(remainingCostForCard({ still_need: 4, market_price: 1, alt_arts: [alt(1, 10)] })).toBe(13);
  });

  it("caps alt copies at still_need so extra wants are not bought (#433)", () => {
    expect(remainingCostForCard({ still_need: 2, market_price: 1, alt_arts: [alt(4, 10)] })).toBe(20);
  });

  it("returns null when a wanted alt has no price (#433)", () => {
    expect(remainingCostForCard({ still_need: 3, market_price: 1, alt_arts: [alt(1, null)] })).toBeNull();
  });

  it("ignores an unpriced alt nobody wants (#433)", () => {
    expect(remainingCostForCard({ still_need: 3, market_price: 2, alt_arts: [alt(0, null)] })).toBe(6);
  });
});

describe("deckRemainingMarket", () => {
  it("sums alt-aware costs and leaves out unpriced and finished cards (#433)", () => {
    const cards = [
      { still_need: 4, market_price: 1, alt_arts: [alt(1, 10)] }, // 13
      { still_need: 2, market_price: 3, alt_arts: [] }, // 6
      { still_need: 2, market_price: null, alt_arts: [] }, // unpriced
      { still_need: 0, market_price: 5, alt_arts: [alt(2, 50)] }, // owned
    ];
    expect(deckRemainingMarket(cards)).toBe(19);
  });
});
