import { describe, expect, it } from "vitest";
import type { OwnedCard, OwnedCollectionResponse } from "./api";
import { compareCardOrder } from "./cardListControls";
import { collectionTotals, patchOwnedCollection } from "./ownedCollection";

const card = (card_id: string, owned: number, market_price: number | null): OwnedCard => ({
  card_id,
  name: card_id,
  rarity: "C",
  color: "Red",
  card_type: "Character",
  cost: 1,
  owned,
  market_price,
  low_price: null,
  value: market_price == null ? null : owned * market_price,
  image_url: "",
  tcgplayer_url: "",
  used_in: [],
});

describe("owned collection", () => {
  it("totals leave unpriced cards out of the value but count their copies (#PRNUM)", () => {
    const totals = collectionTotals([card("A", 3, 2.5), card("B", 2, null)]);
    expect(totals).toEqual({ cards: 2, copies: 5, value: 7.5, unpriced: 1 });
  });

  it("stepping Owned reprices the card and the collection total (#PRNUM)", () => {
    const old: OwnedCollectionResponse = {
      items: [card("A", 3, 2.5), card("B", 1, 10)],
      unique_cards: 2,
      total_copies: 4,
      total_value: 17.5,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollection(old, "a", 5);
    expect(next.items[0]).toMatchObject({ owned: 5, value: 12.5 });
    expect(next.total_value).toBe(22.5);
    expect(next.total_copies).toBe(6);
  });

  it("a card stepped to 0 stays listed but leaves the totals (#PRNUM)", () => {
    const old: OwnedCollectionResponse = {
      items: [card("A", 3, 2.5), card("B", 1, 10)],
      unique_cards: 2,
      total_copies: 4,
      total_value: 17.5,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollection(old, "B", 0);
    expect(next.items.map((i) => i.card_id)).toEqual(["A", "B"]);
    expect(next.unique_cards).toBe(1);
    expect(next.total_value).toBe(7.5);
  });

  it("Value sort puts the most valuable holding first, not the priciest card (#PRNUM)", () => {
    const playset = card("OP01-001", 10, 1); // $10 held
    const single = card("OP01-002", 1, 5); // $5 held, higher price
    const unpriced = card("OP01-003", 4, null);
    const sorted = [unpriced, single, playset].sort((a, b) => compareCardOrder(a, b, ["value"]));
    expect(sorted.map((c) => c.card_id)).toEqual(["OP01-001", "OP01-002", "OP01-003"]);
  });
});
