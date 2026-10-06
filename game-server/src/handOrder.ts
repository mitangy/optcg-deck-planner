/**
 * A player's own hand order, as shown to spectators of unranked rooms.
 *
 * `order` is what the player sent (instance ids, left to right). Cards missing
 * from it (just drawn, not reported yet) are appended in engine order; ids no
 * longer in the hand are dropped, so a stale order can never name a card the
 * seat does not hold.
 */
export function applyHandOrder<T extends { id: string }>(hand: readonly T[], order: readonly string[]): T[] {
  const byId = new Map(hand.map((c) => [c.id, c]));
  const out: T[] = [];
  for (const id of order) {
    const card = byId.get(id);
    if (!card) continue;
    out.push(card);
    byId.delete(id);
  }
  for (const c of hand) if (byId.has(c.id)) out.push(c);
  return out;
}

/** The ids of `ids` that are in `hand`, once each, in the order given. */
export function idsInHand(hand: readonly { id: string }[], ids: readonly string[]): string[] {
  const held = new Set(hand.map((c) => c.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!held.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
