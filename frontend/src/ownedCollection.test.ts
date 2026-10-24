import { describe, expect, it } from "vitest";
import type { OwnedCard, OwnedCollectionResponse, PrintingView } from "./api";
import { compareCardOrder } from "./cardListControls";
import { collectionTotals, patchOwnedCollection, patchOwnedCollectionAlt, patchOwnedCollectionDisplayArt } from "./ownedCollection";

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
  it("stepping an alt's Owned reprices the card at the alt's own price and moves the totals (#723)", () => {
    const alt = (product_id: number, price: number, owned: number): PrintingView =>
      ({ product_id, name: `alt ${product_id}`, market_price: price, owned }) as PrintingView;
    // 2 base at $1 + 1 of alt 100 at $20; alt 101 ($5) is unowned.
    const a: OwnedCard = { ...card("A", 2, 1), alts_owned: 1, value: 22, alt_arts: [alt(100, 20, 1), alt(101, 5, 0)] };
    const old: OwnedCollectionResponse = {
      items: [a, card("B", 1, 10)],
      unique_cards: 2,
      total_copies: 4,
      total_value: 32,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollectionAlt(old, "a", 101, 2);
    expect(next.items[0].alt_arts?.map((x) => [x.product_id, x.owned])).toEqual([[100, 1], [101, 2]]);
    expect(next.items[0]).toMatchObject({ owned: 2, alts_owned: 3, value: 32 });
    expect(next.items[1]).toBe(old.items[1]);
    expect(next.total_copies).toBe(6);
    expect(next.total_value).toBe(42);
    // Back to 0 on every alt: the card stays listed (base copies remain) at its base value.
    const cleared = patchOwnedCollectionAlt(patchOwnedCollectionAlt(next, "A", 101, 0), "A", 100, 0);
    expect(cleared.items[0]).toMatchObject({ alts_owned: 0, value: 2 });
    expect(cleared.total_value).toBe(12);
  });

  it("choosing the art sets display_art on that card only (#723)", () => {
    const old: OwnedCollectionResponse = {
      items: [card("A", 1, 1), card("B", 1, 1)],
      unique_cards: 2,
      total_copies: 2,
      total_value: 2,
      unpriced_cards: 0,
    };
    const next = patchOwnedCollectionDisplayArt(old, "a", 201);
    expect(next.items.map((i) => i.display_art)).toEqual([201, undefined]);
    expect(patchOwnedCollectionDisplayArt(next, "A", null).items[0].display_art).toBeNull();
  });
});
