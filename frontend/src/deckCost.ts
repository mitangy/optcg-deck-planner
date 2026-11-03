import { shownMarket } from "./altArt";

type CostAlt = {
  product_id?: number;
  owned?: number | null;
  wanted?: number | null;
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
    const take = Math.min(Math.max(0, alt.wanted ?? 0), left);
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
