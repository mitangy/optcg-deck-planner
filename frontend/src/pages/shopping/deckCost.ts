import { shownMarket } from "../../cards/altArt";
import { deckOwnedOfAlt, hasExtraCopiesToBuy, shoppingSortCost } from "../collection/collectorLines";

type CostAlt = {
  product_id?: number;
  owned?: number | null;
  wanted?: number | null;
  /** Collector copies wanted on top of decks (#1031): owned copies fill these first. */
  collector?: number | null;
  market_price?: number | null;
};

export type CostCard = {
  still_need: number;
  market_price: number | null;
  /** Alt arts with the copies the user picked to buy (`wanted`), in list order. */
  alt_arts?: CostAlt[] | null;
  /** The viewer's chosen art: null/undefined = automatic, 0 = base, >0 = a product id. */
  display_art?: number | null;
};

export type BuySplit = {
  /** Still-needed copies covered by picked alt arts. */
  altCopies: number;
  /** Still-needed copies bought as the standard art. */
  baseCopies: number;
  /** Null when a needed copy has no market price. */
  cost: number | null;
};

/**
 * Copies of an alt art still to buy: the picked copies minus the ones the user owns.
 * still_need already drops owned alt copies, so counting them in the pick too would
 * price them twice (#908). Mirrors the backend `shopping_list`.
 */
export function altBuyCopies(alt: Pick<CostAlt, "wanted" | "owned" | "collector">): number {
  // Owned copies held back as collector copies do not lower the deck's still_need, so they do not lower the pick either (#1031).
  return Math.max(0, (alt.wanted ?? 0) - deckOwnedOfAlt({ owned: alt.owned ?? 0, collector: alt.collector ?? 0 }));
}

/**
 * Splits still_need across the picked alt arts (list order, each capped by what
 * is left), then the standard art. Mirrors the backend `allocate_still_need_buys`.
 */
export function splitStillNeed(card: CostCard): BuySplit {
  const still = Math.max(0, card.still_need);
  let left = still;
  let total = 0;
  let priced = true;
  let altCopies = 0;
  for (const alt of card.alt_arts ?? []) {
    if (left <= 0) break;
    const take = Math.min(altBuyCopies(alt), left);
    if (take <= 0) continue;
    left -= take;
    altCopies += take;
    if (alt.market_price == null) priced = false;
    else total += take * alt.market_price;
  }
  if (left > 0) {
    if (card.market_price == null) priced = false;
    else total += left * card.market_price;
  }
  return {
    altCopies,
    baseCopies: left,
    cost: priced ? Math.round(total * 100) / 100 : null,
  };
}

/**
 * Price a Master Shopping card sorts by (#926): what you still pay for it (picked alt arts at
 * their own price), or the price of the art it shows when nothing is left to buy (#928).
 */
export function shoppingShownPrice(card: CostCard): number | null {
  return card.still_need > 0 ? splitStillNeed(card).cost : (shownMarket(card).price ?? null);
}

/**
 * Price the Sort menu's Price orders Master Shopping by (#1211): the deck part plus the Extra copies still to
 * buy, so a covered card with a pricey Extra copy sorts high. With no Extra copy to buy it is `shoppingShownPrice`.
 */
export function shoppingMenuPrice(
  card: CostCard & { remaining_cost?: number | null; collector_wants?: { still_need: number; remaining_cost: number | null }[] | null },
): number | null {
  return hasExtraCopiesToBuy(card)
    ? shoppingSortCost({ still_need: card.still_need, remaining_cost: card.remaining_cost ?? splitStillNeed(card).cost, collector_wants: card.collector_wants })
    : shoppingShownPrice(card);
}

/**
 * Remaining market cost of one card: still_need copies, the ones picked as an
 * alt art (#906) at that art's price and the rest at the standard
 * price. Alt arts the user owns already reduce still_need on the server.
 * Null when a needed copy is unpriced.
 */
export function remainingCostForCard(card: CostCard): number | null {
  return splitStillNeed(card).cost;
}

/** Sum of remaining cost over a deck's cards; unpriced cards are left out. */
export function deckRemainingMarket(cards: CostCard[]): number {
  const total = cards.reduce((sum, c) => sum + (remainingCostForCard(c) ?? 0), 0);
  return Math.round(total * 100) / 100;
}
