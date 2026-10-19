export type CostCard = {
  still_need: number;
  market_price: number | null;
};

/**
 * Remaining market cost of one card: still_need copies at the standard price.
 * Alt arts the user owns already reduce still_need on the server, and alt
 * "wants" no longer steer the planner's cost. Null when a needed copy is unpriced.
 */
export function remainingCostForCard(card: CostCard): number | null {
  const still = card.still_need;
  if (still <= 0) return 0;
  if (card.market_price == null) return null;
  return Math.round(still * card.market_price * 100) / 100;
}

/** Sum of remaining cost over a deck's cards; unpriced cards are left out. */
export function deckRemainingMarket(cards: CostCard[]): number {
  const total = cards.reduce((sum, c) => sum + (remainingCostForCard(c) ?? 0), 0);
  return Math.round(total * 100) / 100;
}
