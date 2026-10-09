/** The quiet "who is around" line at the bottom of the lobby's side column. */

import type { LiveCounts } from "../net/api";

/** Below this many people online the line stays hidden: a near-empty count reads as a ghost town. */
export const LIVE_MIN_ONLINE = 5;

/** "38 online · 11 matches in progress", or null while the counts are unknown or too small to show. */
export function liveLine(counts: LiveCounts | null | undefined): string | null {
  if (!counts) return null;
  if (counts.online < LIVE_MIN_ONLINE) return null;
  const matches = counts.matches === 1 ? "1 match" : `${counts.matches} matches`;
  return `${counts.online} online · ${matches} in progress`;
}
