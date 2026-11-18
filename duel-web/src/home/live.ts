import type { LiveCounts } from "../net/api";

export const LIVE_MIN_ONLINE = 5;

export type LiveSummary = { matches: number; text: string; empty: boolean };

export function liveSummary(counts: LiveCounts | null | undefined): LiveSummary | null {
  if (!counts) return null;
  const matches = counts.matches === 1 ? "1 match" : `${counts.matches} matches`;
  const online = counts.online >= LIVE_MIN_ONLINE ? ` · ${counts.online} online` : "";
  return { matches: counts.matches, text: `${matches} being played now${online}`, empty: counts.matches === 0 };
}
