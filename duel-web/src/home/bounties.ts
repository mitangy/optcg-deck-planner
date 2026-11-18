export function pinnedYou(
  me: { user_id: number; rank: number | null; rating: number } | null,
  shownUserIds: readonly number[],
): { rank: number; rating: number } | null {
  if (!me || me.rank == null) return null;
  if (shownUserIds.includes(me.user_id)) return null;
  return { rank: me.rank, rating: me.rating };
}
