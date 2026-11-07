import { useQueryClient } from "@tanstack/react-query";
import { DeckDetail, PrintingView, OwnedCollectionResponse, ShoppingResponse } from "../api";
import { remainingCostForCard } from "../deckCost";
import {
  applyCollectorToShopping,
  collectorCostTotal,
  deckAltsOwned,
  collectorStillTotal,
  refreshCollectorHave,
} from "../collectorLines";
import { patchOwnedCollection, patchOwnedCollectionAlt } from "../ownedCollection";
import { qk } from "../queryKeys";

function sumAltOwned(alts: { owned?: number }[]): number {
  return alts.reduce((n, a) => n + (a.owned ?? 0), 0);
}

/** Alt copies count as owned: still_need = Need − base owned − alt owned (− earlier leaders' claim). */
export function stillNeedFor(need: number, owned: number, altsOwned: number, earlierLeadersNeed = 0): number {
  return Math.max(0, need - Math.max(0, owned + altsOwned - earlierLeadersNeed));
}

export function applyAltOwnedOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number,
  qty: number,
) {
  const id = cardId.toUpperCase();
  const patchAlts = (alts: PrintingView[] | undefined) =>
    (alts ?? []).map((a) => (a.product_id === productId ? { ...a, owned: qty } : a));
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) => {
    if (!old) return old;
    let cardsStill = 0;
    let remaining = 0;
    const items = old.items.map((item) => {
      let patched = item;
      if (item.card_id.toUpperCase() === id) {
        const alt_arts = patchAlts(item.alt_arts);
        // alts_owned is what counts for decks: owned alt copies minus the collector-reserved ones (#1031).
        const alts_owned = deckAltsOwned(sumAltOwned(alt_arts), alt_arts);
        const still_need = stillNeedFor(item.need, item.owned, alts_owned);
        patched = {
          ...item,
          alt_arts,
          alts_owned,
          collector_wants: refreshCollectorHave(item.collector_wants, productId, qty),
          still_need,
          remaining_cost: remainingCostForCard({ still_need, market_price: item.market_price, alt_arts }),
        };
      }
      cardsStill += patched.still_need;
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return patched;
    });
    return {
      ...old,
      items,
      cards_still_needed: cardsStill + collectorStillTotal(items),
      remaining_market: Math.round((remaining + collectorCostTotal(items)) * 100) / 100,
    };
  });
  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: qk.owned.all() }, (old) =>
    old ? patchOwnedCollectionAlt(old, id, productId, qty) : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: qk.deck.all() }, (old) => {
    if (!old) return old;
    return {
      ...old,
      cards: old.cards.map((card) => {
        if (card.card_id.toUpperCase() !== id) return card;
        const alt_arts = patchAlts(card.alt_arts);
        const alts_owned = deckAltsOwned(sumAltOwned(alt_arts), alt_arts);
        return {
          ...card,
          alt_arts,
          alts_owned,
          still_need: stillNeedFor(card.needed, card.owned, alts_owned, card.earlier_leaders_need ?? 0),
        };
      }),
    };
  });
}

/**
 * Buy mode (#906): sets how many still-needed copies of one alt art to buy in the
 * cached shopping list and deck, and reprices the card with the pick.
 */
export function applyAltBuyOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number,
  qty: number,
) {
  const id = cardId.toUpperCase();
  const patchAlts = (alts: PrintingView[] | undefined) =>
    (alts ?? []).map((a) => (a.product_id === productId ? { ...a, wanted: qty } : a));
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) => {
    if (!old) return old;
    let remaining = 0;
    const items = old.items.map((item) => {
      let patched = item;
      if (item.card_id.toUpperCase() === id) {
        const alt_arts = patchAlts(item.alt_arts);
        patched = {
          ...item,
          alt_arts,
          remaining_cost: remainingCostForCard({
            still_need: item.still_need,
            market_price: item.market_price,
            alt_arts,
          }),
        };
      }
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return patched;
    });
    return { ...old, items, remaining_market: Math.round((remaining + collectorCostTotal(items)) * 100) / 100 };
  });
  qc.setQueriesData<DeckDetail>({ queryKey: qk.deck.all() }, (old) =>
    old
      ? {
          ...old,
          cards: old.cards.map((card) =>
            card.card_id.toUpperCase() === id ? { ...card, alt_arts: patchAlts(card.alt_arts) } : card,
          ),
        }
      : old,
  );
}

/** Sets one collector want in the cached shopping lists and deck pages (#1031). */
export function applyCollectorOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number,
  qty: number,
) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) =>
    old ? applyCollectorToShopping(old, id, productId, qty) : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: qk.deck.all() }, (old) =>
    old
      ? {
          ...old,
          cards: old.cards.map((card) => {
            if (card.card_id.toUpperCase() !== id) return card;
            const alt_arts = (card.alt_arts ?? []).map((a) => (a.product_id === productId ? { ...a, collector: qty } : a));
            return { ...card, alt_arts, collector_want: alt_arts.reduce((n, a) => n + (a.collector ?? 0), 0) };
          }),
        }
      : old,
  );
}

function patchOwnedQty(
  cardId: string,
  qty: number,
  need: number,
  market: number | null | undefined,
  altsOwned = 0,
  altArts?: PrintingView[],
) {
  const still = stillNeedFor(need, qty, altsOwned);
  const remaining = remainingCostForCard({
    still_need: still,
    market_price: market != null && !Number.isNaN(market) ? market : null,
    alt_arts: altArts,
  });
  return { owned: qty, still_need: still, remaining_cost: remaining };
}

export function applyOwnedOptimistic(qc: ReturnType<typeof useQueryClient>, cardId: string, qty: number) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) => {
    if (!old) return old;
    let cardsStill = 0;
    let remaining = 0;
    const items = old.items.map((item) => {
      if (item.card_id.toUpperCase() !== id) {
        cardsStill += item.still_need;
        if (item.remaining_cost != null) remaining += item.remaining_cost;
        return item;
      }
      const patched = patchOwnedQty(id, qty, item.need, item.market_price, item.alts_owned ?? 0, item.alt_arts);
      cardsStill += patched.still_need;
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return { ...item, ...patched };
    });
    return {
      ...old,
      items,
      cards_still_needed: cardsStill + collectorStillTotal(items),
      remaining_market: Math.round((remaining + collectorCostTotal(items)) * 100) / 100,
    };
  });
  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: qk.owned.all() }, (old) =>
    old ? patchOwnedCollection(old, id, qty) : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: qk.deck.all() }, (old) => {
    if (!old) return old;
    return {
      ...old,
      cards: old.cards.map((card) => {
        if (card.card_id.toUpperCase() !== id) return card;
        // Earlier leaders take their copies first in "Separate per leader" mode.
        return {
          ...card,
          owned: qty,
          still_need: stillNeedFor(card.needed, qty, card.alts_owned ?? 0, card.earlier_leaders_need ?? 0),
        };
      }),
    };
  });
}

/** Sets a card's direct target in the cached shopping list: need = max(deck need, target). */
export function applyWantOptimistic(qc: ReturnType<typeof useQueryClient>, cardId: string, extraQty: number) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) => {
    if (!old) return old;
    let cardsStill = 0;
    let remaining = 0;
    const items = old.items.flatMap((item) => {
      if (item.card_id.toUpperCase() !== id) {
        cardsStill += item.still_need;
        if (item.remaining_cost != null) remaining += item.remaining_cost;
        return [item];
      }
      const need = Math.max(item.deck_need ?? 0, extraQty);
      if (need === 0) return [];
      const patched = patchOwnedQty(id, item.owned, need, item.market_price, item.alts_owned ?? 0, item.alt_arts);
      cardsStill += patched.still_need;
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return [{ ...item, ...patched, need, extra_qty: extraQty }];
    });
    return {
      ...old,
      items,
      cards_still_needed: cardsStill + collectorStillTotal(items),
      remaining_market: Math.round((remaining + collectorCostTotal(items)) * 100) / 100,
    };
  });
}
