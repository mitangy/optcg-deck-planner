import type { OwnedCard, OwnedCollectionResponse } from "./api";

export type CollectionTotals = {
  cards: number;
  copies: number;
  value: number;
  /** Cards with no market price, left out of `value`. */
  unpriced: number;
};

/** Totals for the cards currently shown (after search and filters). */
export function collectionTotals(items: OwnedCard[]): CollectionTotals {
  let copies = 0;
  let value = 0;
  let unpriced = 0;
  for (const item of items) {
    copies += item.owned;
    if (item.value == null) unpriced += 1;
    else value += item.value;
  }
  return { cards: items.length, copies, value: Math.round(value * 100) / 100, unpriced };
}

/**
 * Apply an Owned stepper change to the cached collection. A card set to 0
 * stays listed (at 0) until the next refetch so the row doesn't vanish under
 * the pointer; totals update right away.
 */
export function patchOwnedCollection(
  old: OwnedCollectionResponse,
  cardId: string,
  qty: number,
): OwnedCollectionResponse {
  const id = cardId.toUpperCase();
  const items = old.items.map((item) => {
    if (item.card_id.toUpperCase() !== id) return item;
    const value = item.market_price == null ? null : Math.round(qty * item.market_price * 100) / 100;
    return { ...item, owned: qty, value };
  });
  const totals = collectionTotals(items.filter((i) => i.owned > 0));
  return {
    ...old,
    items,
    unique_cards: totals.cards,
    total_copies: totals.copies,
    total_value: totals.value,
    unpriced_cards: totals.unpriced,
  };
}
