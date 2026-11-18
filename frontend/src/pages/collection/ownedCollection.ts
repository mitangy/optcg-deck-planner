import type { QueryClient } from "@tanstack/react-query";
import type { OwnedCard, OwnedCollectionResponse } from "../../api";
import { qk } from "../../cache/queryKeys";

export type CollectionTotals = {
  cards: number;
  copies: number;
  value: number;
  unpriced: number;
};

export function holdsCopies(item: OwnedCard): boolean {
  return item.owned + (item.alts_owned ?? 0) > 0;
}

export function collectionTotals(items: OwnedCard[]): CollectionTotals {
  let copies = 0;
  let value = 0;
  let unpriced = 0;
  for (const item of items) {
    copies += item.owned + (item.alts_owned ?? 0);
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
    // Alt copies are valued server-side at their own prices, so move only the
    // base copies' share of the value.
    const alts = item.alts_owned ?? 0;
    let value: number | null;
    if (alts === 0) {
      value = item.market_price == null ? null : Math.round(qty * item.market_price * 100) / 100;
    } else if (item.market_price == null || item.value == null) {
      value = item.value;
    } else {
      value = Math.round((item.value + (qty - item.owned) * item.market_price) * 100) / 100;
    }
    const buying = item.buying ? Math.max(0, item.owned + item.buying - qty) : item.buying;
    return { ...item, owned: qty, value, buying };
  });
  const totals = collectionTotals(items.filter(holdsCopies));
  return {
    ...old,
    items,
    unique_cards: totals.cards,
    total_copies: totals.copies,
    total_value: totals.value,
    unpriced_cards: totals.unpriced,
  };
}

export function patchOwnedCollectionAlt(
  old: OwnedCollectionResponse,
  cardId: string,
  productId: number,
  qty: number,
): OwnedCollectionResponse {
  const id = cardId.toUpperCase();
  const items = old.items.map((item) => {
    if (item.card_id.toUpperCase() !== id) return item;
    const before = (item.alt_arts ?? []).find((a) => a.product_id === productId);
    if (!before) return item;
    const alt_arts = (item.alt_arts ?? []).map((a) => (a.product_id === productId ? { ...a, owned: qty } : a));
    const alts_owned = alt_arts.reduce((n, a) => n + (a.owned ?? 0), 0);
    const delta = qty - (before.owned ?? 0);
    const value =
      item.value == null || before.market_price == null
        ? item.value
        : Math.round((item.value + delta * before.market_price) * 100) / 100;
    return { ...item, alt_arts, alts_owned, value };
  });
  const totals = collectionTotals(items.filter(holdsCopies));
  return {
    ...old,
    items,
    unique_cards: totals.cards,
    total_copies: totals.copies,
    total_value: totals.value,
    unpriced_cards: totals.unpriced,
  };
}

export function patchOwnedCollectionCollector(
  old: OwnedCollectionResponse,
  cardId: string,
  productId: number,
  qty: number,
): OwnedCollectionResponse {
  const id = cardId.toUpperCase();
  return {
    ...old,
    items: old.items.map((item) =>
      item.card_id.toUpperCase() === id
        ? {
            ...item,
            alt_arts: (item.alt_arts ?? []).map((a) => (a.product_id === productId ? { ...a, collector: qty } : a)),
          }
        : item,
    ),
  };
}

export function patchOwnedCollectionDisplayArt(
  old: OwnedCollectionResponse,
  cardId: string,
  productId: number | null,
): OwnedCollectionResponse {
  const id = cardId.toUpperCase();
  return {
    ...old,
    items: old.items.map((item) =>
      item.card_id.toUpperCase() === id ? { ...item, display_art: productId } : item,
    ),
  };
}

export function invalidateOwnedViews(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.shopping.all() });
  void qc.invalidateQueries({ queryKey: qk.deck.all() });
  void qc.invalidateQueries({ queryKey: qk.owned.all() });
}
