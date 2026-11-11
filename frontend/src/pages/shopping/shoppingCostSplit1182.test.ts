import { describe, expect, it } from "vitest";
import { shoppingCostParts, shoppingCostSplit } from "./shoppingStats";

const gold = (cost: number) => ({
  product_id: 1,
  label: "Gold",
  image_url: null,
  market_price: cost,
  want: 1,
  have: 0,
  still_need: 1,
  remaining_cost: cost,
});

// Deck card $100 left, a card added directly $40 left (deck_need 0), $25 of Extra copies on the deck card.
const data = {
  remaining_market: 165,
  items: [
    { still_need: 2, remaining_cost: 100, deck_need: 3, collector_wants: [gold(25)] },
    { still_need: 1, remaining_cost: 40, deck_need: 0, collector_wants: [] },
  ],
};

describe("Est. cost split (#1182)", () => {
  it("separates deck cards, cards added directly and Extra copies", () => {
    expect(shoppingCostSplit(data)).toEqual({ decks: 100, added: 40, extra: 25 });
  });

  it("counts Extra copies of an added-only card as Extra, not Added", () => {
    const split = shoppingCostSplit({
      remaining_market: 65,
      items: [{ still_need: 1, remaining_cost: 40, deck_need: 0, collector_wants: [gold(25)] }],
    });
    expect(split).toEqual({ decks: 0, added: 40, extra: 25 });
  });

  it("never reports a negative deck part", () => {
    expect(shoppingCostSplit({ ...data, remaining_market: 10 }).decks).toBe(0);
  });

  it("names only the parts above zero, in compact money", () => {
    expect(shoppingCostParts(data)).toEqual(["Decks $100", "Added $40", "Extra $25"]);
    expect(
      shoppingCostParts({
        remaining_market: 7901,
        items: [
          { still_need: 1, remaining_cost: 2380, deck_need: 0, collector_wants: [gold(3524)] },
          { still_need: 1, remaining_cost: 1997, deck_need: 2, collector_wants: [] },
        ],
      }),
    ).toEqual(["Decks $2K", "Added $2.4K", "Extra $3.5K"]);
    expect(
      shoppingCostParts({
        remaining_market: 140,
        items: [{ still_need: 1, remaining_cost: 100, deck_need: 2, collector_wants: [gold(40)] }],
      }),
    ).toEqual(["Decks $100", "Extra $40"]);
  });

  it("shows nothing extra when one part is the whole total", () => {
    expect(shoppingCostParts({ remaining_market: 100, items: [{ still_need: 1, remaining_cost: 100, deck_need: 2 }] })).toEqual([]);
    expect(shoppingCostParts({ remaining_market: 0, items: [] })).toEqual([]);
  });
});
