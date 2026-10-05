import type { MatchHistoryEntry } from "./historyApi";

export type HistorySummary = {
  wins: number;
  losses: number;
  /** Bounty after your latest ranked game; null when you have none yet. */
  rating: number | null;
};

/** Win-loss record over the games listed, and the Bounty from the newest ranked one. */
export function historySummary(matches: readonly MatchHistoryEntry[]): HistorySummary | null {
  if (matches.length === 0) return null;
  const wins = matches.filter((m) => m.won).length;
  const time = (m: MatchHistoryEntry) => (m.created_at ? Date.parse(m.created_at) : 0) || 0;
  const newestRanked = matches.filter((m) => m.ranked).sort((a, b) => time(b) - time(a))[0];
  return { wins, losses: matches.length - wins, rating: newestRanked ? newestRanked.rating_after : null };
}
