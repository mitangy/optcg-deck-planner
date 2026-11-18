import { shownMarket } from "../../cards/altArt";
import { deckOwnedOfAlt, hasExtraCopiesToBuy, shoppingSortCost } from "../collection/collectorLines";

type CostAlt = {
  product_id?: number;
  owned?: number | null;
  wanted?: number | null;
  collector?: number | null;
  market_price?: number | null;
};

export type CostCard = {
  still_need: number;
  market_price: number | null;
  alt_arts?: CostAlt[] | null;
  display_art?: number | null;
};

export type BuySplit = {
  altCopies: number;
  baseCopies: number;
  cost: number | null;
};

/**
 * Copies of an alt art still to buy: the picked copies minus the ones the user owns.
 * still_need already drops owned alt copies, so counting them in the pick too would
 * price them twice (#908). Mirrors the backend `shopping_list`.
 */
export function altBuyCopies(alt: Pick<CostAlt, "wanted" | "owned" | "collector">): number {
  return Math.max(0, (alt.wanted ?? 0) - deckOwnedOfAlt({ owned: alt.owned ?? 0, collector: alt.collector ?? 0 }));
}

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

export function shoppingShownPrice(card: CostCard): number | null {
  return card.still_need > 0 ? splitStillNeed(card).cost : (shownMarket(card).price ?? null);
}

export function shoppingMenuPrice(
  card: CostCard & { remaining_cost?: number | null; collector_wants?: { still_need: number; remaining_cost: number | null }[] | null },
): number | null {
  return hasExtraCopiesToBuy(card)
    ? shoppingSortCost({ still_need: card.still_need, remaining_cost: card.remaining_cost ?? splitStillNeed(card).cost, collector_wants: card.collector_wants })
    : shoppingShownPrice(card);
}

export function remainingCostForCard(card: CostCard): number | null {
  return splitStillNeed(card).cost;
}

export function deckRemainingMarket(cards: CostCard[]): number {
  const total = cards.reduce((sum, c) => sum + (remainingCostForCard(c) ?? 0), 0);
  return Math.round(total * 100) / 100;
}
