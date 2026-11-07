import { describe, expect, it } from "vitest";
import type { CollectorLine, PrintingView, ShoppingItem, ShoppingResponse } from "../../api";
import {
  applyCollectorToShopping,
  canOpenBuyPopover,
  collectorChoices,
  collectorHaveText,
  collectorOnTopOf,
  collectorStatNote,
  deckAltsOwned,
  deckOwnedOfAlt,
  itemNeedsCopies,
  refreshCollectorHave,
  visibleCollectorLines,
} from "./collectorLines";
import { altBuyCopies } from "../shopping/deckCost";

const line = (over: Partial<CollectorLine> = {}): CollectorLine => ({
  product_id: 202,
  label: "Gold-stamped",
  image_url: null,
  market_price: 30,
  want: 1,
  have: 0,
  still_need: 1,
  remaining_cost: 30,
  ...over,
});

const alt = (over: Partial<PrintingView> = {}): PrintingView => ({
  product_id: 202,
  name: "Gold-stamped",
  market_price: 30,
  low_price: null,
  image_url: "g.jpg",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  owned: 0,
  wanted: 0,
  collector: 0,
  ...over,
});

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem =>
  ({
    card_id: "EB05-055",
    name: "Izo",
    need: 4,
    owned: 0,
    still_need: 4,
    market_price: 2,
    remaining_cost: 8,
    used_in: ["Deck A"],
    alt_arts: [alt()],
    collector_wants: [],
    ...over,
  }) as ShoppingItem;

const list = (items: ShoppingItem[]): ShoppingResponse => ({
  items,
  cards_still_needed: items.reduce((n, i) => n + i.still_need, 0),
  remaining_market: items.reduce((n, i) => n + (i.remaining_cost ?? 0), 0),
  unique_cards: items.length,
});

describe("collector copies (#1031)", () => {
  it("a collector line reads Have 0 of 1 until the want is covered, then Have it (#1031)", () => {
    expect(collectorHaveText(line({ want: 1, have: 0 }))).toBe("Have 0 of 1");
    expect(collectorHaveText(line({ want: 2, have: 1 }))).toBe("Have 1 of 2");
    expect(collectorHaveText(line({ want: 1, have: 1 }))).toBe("✓ Have it");
  });

  it("a card with nothing left for its decks still shows under Still need while a collector line needs copies (#1031)", () => {
    expect(itemNeedsCopies({ still_need: 0, collector_wants: [line({ still_need: 1 })] })).toBe(true);
    expect(itemNeedsCopies({ still_need: 0, collector_wants: [line({ have: 1, still_need: 0 })] })).toBe(false);
    expect(itemNeedsCopies({ still_need: 2, collector_wants: [] })).toBe(true);
  });

  it("Still need hides a collector line once you have it and keeps the missing ones (#1031)", () => {
    const covered = line({ product_id: 1, have: 1, still_need: 0 });
    const missing = line({ product_id: 2 });
    const it1 = item({ collector_wants: [covered, missing] });
    expect(visibleCollectorLines(it1, true).map((l) => l.product_id)).toEqual([2]);
    expect(visibleCollectorLines(it1, false).map((l) => l.product_id)).toEqual([1, 2]);
  });

  it("the price opens at Still 0 only when a collector copy can be added to a card with alt arts (#1031)", () => {
    expect(canOpenBuyPopover({ still_need: 0, alt_arts: [alt()] }, true)).toBe(true);
    expect(canOpenBuyPopover({ still_need: 0, alt_arts: [alt()] }, false)).toBe(false);
    expect(canOpenBuyPopover({ still_need: 0, alt_arts: [] }, true)).toBe(false);
    expect(canOpenBuyPopover({ still_need: 2, alt_arts: [alt()] }, false)).toBe(true);
  });

  it("owned copies held back for a collector want do not count toward decks (#1031)", () => {
    // Own 2 gold with a collector want of 1: one is reserved, one counts for decks.
    expect(deckOwnedOfAlt({ owned: 2, collector: 1 })).toBe(1);
    // Own 1 gold with want 3: the only copy is reserved.
    expect(deckOwnedOfAlt({ owned: 1, collector: 3 })).toBe(0);
    expect(deckOwnedOfAlt({ owned: 2, collector: 0 })).toBe(2);
    expect(deckAltsOwned(3, [alt({ owned: 2, collector: 1 }), alt({ product_id: 203, owned: 1 })])).toBe(2);
  });

  it("an alt buy pick is only reduced by the owned copies that count for decks (#1031)", () => {
    expect(altBuyCopies({ wanted: 2, owned: 1, collector: 1 })).toBe(2);
    expect(altBuyCopies({ wanted: 2, owned: 1, collector: 0 })).toBe(1);
  });

  it("only alt printings can be picked as a collector copy (#1031)", () => {
    const base = alt({ product_id: 1, is_special: false });
    expect(collectorChoices([base, alt()]).map((a) => a.product_id)).toEqual([202]);
  });

  it("adding a collector copy puts a line under the card and its cost in the totals (#1031)", () => {
    const before = list([item()]);
    const after = applyCollectorToShopping(before, "eb05-055", 202, 1);
    const [it1] = after.items;
    expect(it1!.collector_wants).toEqual([
      { product_id: 202, label: "Gold-stamped", image_url: "g.jpg", market_price: 30, want: 1, have: 0, still_need: 1, remaining_cost: 30 },
    ]);
    expect(it1!.alt_arts[0]!.collector).toBe(1);
    expect(after.cards_still_needed).toBe(5);
    expect(after.remaining_market).toBe(38);
    expect(after.collector_copies).toBe(1);
  });

  it("an owned printing fills the collector line first, so the added line needs fewer copies (#1031)", () => {
    const owned = item({ alt_arts: [alt({ owned: 1 })] });
    const after = applyCollectorToShopping(list([owned]), "EB05-055", 202, 2);
    expect(after.items[0]!.collector_wants![0]).toMatchObject({ want: 2, have: 1, still_need: 1, remaining_cost: 30 });
    expect(after.cards_still_needed).toBe(5);
  });

  it("removing a collector copy takes its line and its totals back out (#1031)", () => {
    const withLine = item({ alt_arts: [alt({ collector: 1 })], collector_wants: [line()] });
    const base = { ...list([withLine]), cards_still_needed: 5, remaining_market: 38, collector_copies: 1 };
    const after = applyCollectorToShopping(base, "EB05-055", 202, 0);
    expect(after.items[0]!.collector_wants).toEqual([]);
    expect(after.items[0]!.alt_arts[0]!.collector).toBe(0);
    expect(after.cards_still_needed).toBe(4);
    expect(after.remaining_market).toBe(8);
    expect(after.collector_copies).toBe(0);
  });

  it("changing the count of an existing line keeps its position and label (#1031)", () => {
    const a = line({ product_id: 201, label: "Alt art", market_price: 16, remaining_cost: 16 });
    const b = line();
    const withLines = item({ alt_arts: [alt({ product_id: 201, collector: 1, market_price: 16 }), alt({ collector: 1 })], collector_wants: [a, b] });
    const after = applyCollectorToShopping(list([withLines]), "EB05-055", 201, 2);
    expect(after.items[0]!.collector_wants!.map((l) => [l.product_id, l.want])).toEqual([
      [201, 2],
      [202, 1],
    ]);
    expect(after.items[0]!.collector_wants![0]!.label).toBe("Alt art");
  });

  it("owning more of the printing lowers what the collector line still needs (#1031)", () => {
    const [l] = refreshCollectorHave([line({ want: 2 })], 202, 1)!;
    expect(l).toMatchObject({ have: 1, still_need: 1, remaining_cost: 30 });
    const [done] = refreshCollectorHave([line()], 202, 5)!;
    expect(done).toMatchObject({ have: 1, still_need: 0, remaining_cost: 0 });
    // another printing's count never touches this line
    expect(refreshCollectorHave([line()], 999, 5)![0]!.have).toBe(0);
  });

  it("the line says what it is on top of and stays blank for a card in no deck (#1031)", () => {
    expect(collectorOnTopOf(["Deck A", "Deck B"])).toBe("On top of Deck A, Deck B");
    expect(collectorOnTopOf([])).toBe("");
  });

  it("the Copies note counts collector copies still to buy and hides at zero (#1031)", () => {
    expect(collectorStatNote(2)).toBe("incl. 2 collector");
    expect(collectorStatNote(0)).toBeNull();
    expect(collectorStatNote(undefined)).toBeNull();
  });
});
