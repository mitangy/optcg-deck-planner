import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PrintingView, ShoppingItem, ShoppingResponse } from "../api";
import { applyAltOwnedOptimistic, applyOwnedOptimistic, applyWantOptimistic } from "./optimistic";
import { qk } from "./queryKeys";

const item = (card_id: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  card_id,
  name: card_id,
  rarity: "C",
  color: "Red",
  card_type: "Character",
  cost: 1,
  need: 3,
  owned: 0,
  still_need: 3,
  market_price: 2,
  low_price: null,
  remaining_cost: 6,
  image_url: "",
  tcgplayer_url: "",
  used_in: [],
  alt_arts: [],
  ...over,
});

const alt = (product_id: number, owned = 0): PrintingView => ({
  product_id,
  name: "Alt",
  market_price: 10,
  low_price: null,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: false,
  owned,
});

/** A client holding one cached shopping list, like the page has after its first load. */
function listed(items: ShoppingItem[]) {
  const qc = new QueryClient();
  const stillNeeded = items.reduce((n, i) => n + i.still_need, 0);
  const remaining = items.reduce((n, i) => n + (i.remaining_cost ?? 0), 0);
  qc.setQueryData<ShoppingResponse>(qk.shopping.list([1], true), {
    items,
    cards_still_needed: stillNeeded,
    remaining_market: remaining,
    unique_cards: items.length,
  });
  const read = () => qc.getQueryData<ShoppingResponse>(qk.shopping.list([1], true))!;
  return { qc, read };
}

describe("cached shopping list patches (refactor 3.3)", () => {
  it("owning copies lowers still needed, the cost and both list totals", () => {
    const { qc, read } = listed([item("OP01-001"), item("OP01-002", { need: 2, still_need: 2, remaining_cost: 4 })]);
    applyOwnedOptimistic(qc, "op01-001", 2);
    const patched = read().items[0];
    expect(patched).toMatchObject({ owned: 2, still_need: 1, remaining_cost: 2 });
    expect(read().cards_still_needed).toBe(3);
    expect(read().remaining_market).toBe(6);
  });

  it("an owned alt art counts toward the card's still needed copies", () => {
    const { qc, read } = listed([item("OP01-001", { alt_arts: [alt(7)] })]);
    applyAltOwnedOptimistic(qc, "OP01-001", 7, 2);
    expect(read().items[0].still_need).toBe(1);
    expect(read().cards_still_needed).toBe(1);
  });

  it("a direct target below the decks' need keeps the decks' need", () => {
    const { qc, read } = listed([item("OP01-001", { deck_need: 3, extra_qty: 0 })]);
    applyWantOptimistic(qc, "OP01-001", 1);
    expect(read().items[0]).toMatchObject({ need: 3, extra_qty: 1, still_need: 3 });
  });

  it("clearing the target of a card no deck uses drops its row and its share of the totals", () => {
    const { qc, read } = listed([
      item("OP01-001", { need: 2, still_need: 2, remaining_cost: 4, deck_need: 0, extra_qty: 2 }),
      item("OP01-002", { need: 1, still_need: 1, remaining_cost: 2 }),
    ]);
    applyWantOptimistic(qc, "OP01-001", 0);
    expect(read().items.map((i) => i.card_id)).toEqual(["OP01-002"]);
    expect(read().cards_still_needed).toBe(1);
    expect(read().remaining_market).toBe(2);
  });
});
