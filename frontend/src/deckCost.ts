type AltPrice = { product_id: number; wanted?: number; market_price: number | null };

export type CostCard = {
  still_need: number;
  market_price: number | null;
  alt_arts?: AltPrice[];
};

/**
 * Remaining market cost of one card. Wanted alt-art copies are priced first at
 * their own price (capped by still_need); the rest at the standard price.
 * Mirrors backend `allocate_still_need_buys`. Null when a needed copy is unpriced.
 */
export function remainingCostForCard(card: CostCard): number | null {
  const still = card.still_need;
  if (still <= 0) return 0;
  let remaining = still;
  let total = 0;
  let missingPrice = false;
  for (const alt of card.alt_arts ?? []) {
    if (remaining <= 0) break;
    const want = alt.wanted ?? 0;
    const take = Math.min(Math.max(0, want), remaining);
    if (take <= 0) continue;
    if (alt.market_price == null) missingPrice = true;
    else total += take * alt.market_price;
    remaining -= take;
  }
  if (remaining > 0) {
    if (card.market_price == null) missingPrice = true;
    else total += remaining * card.market_price;
  }
  if (missingPrice) return null;
  return Math.round(total * 100) / 100;
}

/** Sum of remaining cost over a deck's cards; unpriced cards are left out. */
export function deckRemainingMarket(cards: CostCard[]): number {
  const total = cards.reduce((sum, c) => sum + (remainingCostForCard(c) ?? 0), 0);
  return Math.round(total * 100) / 100;
}
