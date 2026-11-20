import type { LeaderboardEntry } from "../net/api";

export type BoardWindow = "all" | "week" | "month";

export const WINDOWS: ReadonlyArray<{ id: BoardWindow; label: string }> = [
  { id: "all", label: "All time" },
  { id: "month", label: "This month" },
  { id: "week", label: "This week" },
];

export type Movement = { kind: "up" | "down" | "new"; label: string; spoken: string };

/** Rank movement since yesterday. Null change means the player was not on the board then. No indicator for 0. */
export function movement(change: number | null | undefined): Movement | null {
  if (change === undefined) return null;
  if (change === null) return { kind: "new", label: "New", spoken: "new on the board since yesterday" };
  if (change > 0) return { kind: "up", label: `▲${change}`, spoken: `up ${change} since yesterday` };
  if (change < 0) return { kind: "down", label: `▼${-change}`, spoken: `down ${-change} since yesterday` };
  return null;
}

/** Keeps the server's ranks: only hides rows. */
export function filterEntries(
  entries: readonly LeaderboardEntry[],
  query: string,
  friendIds: ReadonlySet<number> | null,
  meId: number | null,
): LeaderboardEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (friendIds && !friendIds.has(e.user_id) && e.user_id !== meId) return false;
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || (e.username ?? "").toLowerCase().includes(q);
  });
}

/** Index of the first provisional row in the all-time list, where the divider goes. -1 when there is none or the list starts with one. */
export function provisionalDividerAt(entries: readonly LeaderboardEntry[]): number {
  const i = entries.findIndex((e) => e.provisional);
  return i > 0 ? i : -1;
}
