import { describe, expect, it } from "vitest";
import { listCost, listCostText } from "./listCost";

const cards = [
  { card_id: "A", count: 4, market_price: 1.5 },
  { card_id: "B", count: 2, market_price: 10 },
  { card_id: "C", count: 3, market_price: null },
];

describe("meta list cost (#1342)", () => {
  it("counts the leader and at most the listed copies of each card as owned", () => {
    const owned = new Map([["L", 1], ["A", 9], ["B", 1]]);
    const cost = listCost(cards, { id: "L", price: 5 }, owned);
    expect(cost).toEqual({ have: 1 + 4 + 1, total: 1 + 4 + 2 + 3, remaining: 10, unpriced: 1 });
  });

  it("prices every missing copy, the leader included, and sums to cents", () => {
    const cost = listCost(cards.slice(0, 2), { id: "L", price: 5.05 }, new Map([["A", 1]]));
    expect(cost.remaining).toBe(29.55);
  });

  it("leaves unpriced cards out of the dollars and counts them only while still missing", () => {
    const owned = new Map([["C", 3]]);
    expect(listCost(cards, { id: "L", price: 5 }, owned).unpriced).toBe(0);
    expect(listCost(cards, { id: "L", price: null }, new Map()).unpriced).toBe(2);
  });

  it("words the result", () => {
    expect(listCostText({ have: 38, total: 50, remaining: 24.1, unpriced: 0 })).toBe("You own 38 of 50 · $24.10 to finish");
    expect(listCostText({ have: 40, total: 50, remaining: 24.1, unpriced: 2 })).toBe("You own 40 of 50 · $24.10 to finish (2 unpriced)");
    expect(listCostText({ have: 50, total: 50, remaining: 0, unpriced: 0 })).toBe("You own 50 of 50 · nothing to buy");
  });
});
