import type { MetaDeckCard } from "../api";

export type ListCost = {
  /** Copies of the list (leader included) the viewer already has. */
  have: number;
  total: number;
  /** Price of the copies still missing, for cards that have a price. */
  remaining: number;
  /** Missing cards that have no price, so they are not in `remaining`. */
  unpriced: number;
};

/**
 * What a tournament list costs this viewer: per card min(owned, copies in the list) counts as had.
 * `cards` excludes the leader, which is always one copy.
 */
export function listCost(
  cards: readonly Pick<MetaDeckCard, "card_id" | "count" | "market_price">[],
  leader: { id: string; price: number | null | undefined },
  owned: ReadonlyMap<string, number>,
): ListCost {
  const all = [{ card_id: leader.id, count: 1, market_price: leader.price }, ...cards];
  let have = 0;
  let total = 0;
  let remaining = 0;
  let unpriced = 0;
  for (const c of all) {
    const got = Math.min(owned.get(c.card_id) ?? 0, c.count);
    const missing = c.count - got;
    have += got;
    total += c.count;
    if (missing === 0) continue;
    if (c.market_price == null) unpriced += 1;
    else remaining += missing * c.market_price;
  }
  return { have, total, remaining: Math.round(remaining * 100) / 100, unpriced };
}

export function listCostText(cost: ListCost): string {
  const left = cost.remaining === 0 && cost.unpriced === 0 ? "nothing to buy" : `$${cost.remaining.toFixed(2)} to finish`;
  return `You own ${cost.have} of ${cost.total} · ${left}${cost.unpriced > 0 ? ` (${cost.unpriced} unpriced)` : ""}`;
}
