/** What the lobby says about matches being played right now. */

import type { LiveCounts } from "../net/api";

/** Below this many people online the "N online" part stays hidden: a near-empty count reads as a ghost town. */
export const LIVE_MIN_ONLINE = 5;

export type LiveSummary = { matches: number; text: string; empty: boolean };

/** "3 matches being played now · 14 online". The match count always shows; null while the counts are unknown. */
export function liveSummary(counts: LiveCounts | null | undefined): LiveSummary | null {
  if (!counts) return null;
  const matches = counts.matches === 1 ? "1 match" : `${counts.matches} matches`;
  const online = counts.online >= LIVE_MIN_ONLINE ? ` · ${counts.online} online` : "";
  return { matches: counts.matches, text: `${matches} being played now${online}`, empty: counts.matches === 0 };
}
