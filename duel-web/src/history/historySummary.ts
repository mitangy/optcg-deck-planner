import type { MatchHistoryEntry } from "./historyApi";

export type HistorySummary = {
  wins: number;
  losses: number;
  rating: number | null;
};

export function historySummary(matches: readonly MatchHistoryEntry[]): HistorySummary | null {
  const finished = matches.filter((m) => m.finished !== false);
  if (finished.length === 0) return null;
  const wins = finished.filter((m) => m.won).length;
  const time = (m: MatchHistoryEntry) => (m.created_at ? Date.parse(m.created_at) : 0) || 0;
  const newestRanked = finished.filter((m) => m.ranked).sort((a, b) => time(b) - time(a))[0];
  return { wins, losses: finished.length - wins, rating: newestRanked ? newestRanked.rating_after : null };
}
