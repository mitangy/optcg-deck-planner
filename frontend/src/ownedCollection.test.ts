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
  it("stepping Owned shrinks Buying for a card on the list and floors it at 0 (#525)", () => {
    const old: OwnedCollectionResponse = {
      items: [{ ...card("A", 1, 2), buying: 3 }, { ...card("B", 1, 2), buying: 0 }],
      unique_cards: 2,
      total_copies: 2,
      total_value: 4,
      unpriced_cards: 0,
    };
    const up = patchOwnedCollection(old, "A", 3);
    expect(up.items[0].buying).toBe(1);
    expect(patchOwnedCollection(old, "A", 9).items[0].buying).toBe(0);
    expect(patchOwnedCollection(old, "B", 5).items[1].buying).toBe(0);
  });

  it("totals leave unpriced cards out of the value but count their copies (#268)", () => {
    const totals = collectionTotals([card("A", 3, 2.5), card("B", 2, null)]);
    expect(totals).toEqual({ cards: 2, copies: 5, value: 7.5, unpriced: 1 });
  });

  it("stepping Owned reprices the card and the collection total (#268)", () => {
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

  it("a card stepped to 0 stays listed but leaves the totals (#268)", () => {
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

  it("copies and value include alt-art copies, and stepping base keeps their share (#625)", () => {
    const withAlt = { ...card("A", 2, 1), alts_owned: 1, value: 2 * 1 + 20 }; // 2 base at $1 + 1 alt at $20
    expect(collectionTotals([withAlt]).copies).toBe(3);
    const old: OwnedCollectionResponse = {
      items: [withAlt],
      unique_cards: 1,
      total_copies: 3,
      total_value: 22,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollection(old, "A", 4);
    expect(next.items[0].value).toBe(24);
    expect(next.total_value).toBe(24);
    expect(next.total_copies).toBe(5);
  });

  it("a card owned only as alts stays in the totals when base goes to 0 (#625)", () => {
    const old: OwnedCollectionResponse = {
      items: [{ ...card("A", 2, 1), alts_owned: 1, value: 22 }],
      unique_cards: 1,
      total_copies: 3,
      total_value: 22,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollection(old, "A", 0);
    expect(next.unique_cards).toBe(1);
    expect(next.total_value).toBe(20);
  });

  it("Value sort puts the most valuable holding first, not the priciest card (#268)", () => {
    const playset = card("OP01-001", 10, 1); // $10 held
    const single = card("OP01-002", 1, 5); // $5 held, higher price
    const unpriced = card("OP01-003", 4, null);
    const sorted = [unpriced, single, playset].sort((a, b) => compareCardOrder(a, b, ["value"]));
    expect(sorted.map((c) => c.card_id)).toEqual(["OP01-001", "OP01-002", "OP01-003"]);
  });
});
