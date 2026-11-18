import { describe, expect, it } from "vitest";
import type { ShoppingItem } from "../../api";
import { collectorSelectKey } from "../collection/collectorLines";
import { buyCards, pickSelection, usedInChips } from "./shoppingBuy";

const item = (id: string, still: number, extra: Partial<ShoppingItem> = {}) =>
  ({ card_id: id, name: id, still_need: still, need: still, used_in: ["Deck A"], collector_wants: [], ...extra }) as unknown as ShoppingItem;
const line = (productId: number, still: number) => ({ product_id: productId, label: "Manga", still_need: still }) as never;

const items = [item("A-1", 2), item("B-2", 0), item("C-3", 3, { collector_wants: [line(9, 1)] })];

describe("Buy on TCGPlayer targets (#1342)", () => {
  it("with nothing selected buys every card that still needs copies, extra copies included (#1342)", () => {
    const cards = buyCards(items, pickSelection(items, new Set()));
    expect(cards.map((c) => `${c.card_id}:${c.product_id ?? ""}:${c.still_need}`).sort()).toEqual(["A-1::2", "C-3:9:1", "C-3::3"]);
  });

  it("with cards selected buys only the selection (#1342)", () => {
    const cards = buyCards(items, pickSelection(items, new Set(["A-1", collectorSelectKey("C-3", 9)])));
    expect(cards.map((c) => `${c.card_id}:${c.still_need}`).sort()).toEqual(["A-1:2", "C-3:1"]);
  });

  it("ids left over from an older list do not count as a selection (#1342)", () => {
    const cards = buyCards(items, pickSelection(items, new Set(["GONE-1"])));
    expect(cards.map((c) => c.card_id).sort()).toEqual(["A-1", "C-3", "C-3"]);
  });
});

describe("Used in chips (#1342)", () => {
  it("carry the count per leader when the copies are split by leader (#1342)", () => {
    const it2 = item("A-1", 4, { need: 4, need_by_leader: [{ label: "Luffy & Ace", need: 4 }, { label: "Sabo", need: 2 }] });
    expect(usedInChips(it2)).toEqual(["Luffy & Ace ×4", "Sabo ×2"]);
  });
});
