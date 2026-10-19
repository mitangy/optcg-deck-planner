/** The pinned "You" row under Top bounties. */

/**
 * Your rank and Bounty when your row is not among the entries shown; null when it is, or you have no rank.
 * Matches on `user_id`, not rank: ties share a rank, so a rank can be 1 while your row is cut off the list (#466).
 */
export function pinnedYou(
  me: { user_id: number; rank: number | null; rating: number } | null,
  shownUserIds: readonly number[],
): { rank: number; rating: number } | null {
  // No rank (signed out, or no ranked games yet) means there is no board position to show: nothing to pin.
  if (!me || me.rank == null) return null;
  if (shownUserIds.includes(me.user_id)) return null;
  return { rank: me.rank, rating: me.rating };
}
