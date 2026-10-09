/** The pinned "You" row under Top bounties. */

/** Your rank and Bounty when you are not among the first `topN`; null when you are, or have no rank. */
export function pinnedYou(
  me: { rank: number | null; rating: number } | null,
  topN: number,
): { rank: number; rating: number } | null {
  // No rank (signed out, or no ranked games yet) counts as already on the board: nothing to pin.
  const rank = me?.rank ?? 0;
  if (!me || rank <= topN) return null;
  return { rank, rating: me.rating };
}
