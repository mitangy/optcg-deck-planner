import type { MatchHistoryEntry } from "./historyApi";

export type WinLoss = { wins: number; losses: number };
export type Streak = { kind: "W" | "L"; count: number };

export type HistorySummary = {
  /** Finished games counted: wins + losses. Cut-off games are left out. */
  games: number;
  wins: number;
  losses: number;
  /** Whole percent of finished games won. */
  winPct: number;
  ranked: WinLoss;
  casual: WinLoss;
  /** The run you are on right now, newest game first; null before any finished game. */
  streak: Streak | null;
  /** Your last results, newest first, at most RECENT_GAMES. */
  recent: ("W" | "L")[];
  rating: number | null;
};

export const RECENT_GAMES = 10;

const tally = (games: readonly MatchHistoryEntry[]): WinLoss => {
  const wins = games.filter((m) => m.won).length;
  return { wins, losses: games.length - wins };
};

export function historySummary(matches: readonly MatchHistoryEntry[]): HistorySummary | null {
  const time = (m: MatchHistoryEntry) => (m.created_at ? Date.parse(m.created_at) : 0) || 0;
  // Newest first whatever order the list came in (the sort is stable, so equal times keep the list's order).
  const finished = matches.filter((m) => m.finished !== false).sort((a, b) => time(b) - time(a));
  if (finished.length === 0) return null;
  const { wins, losses } = tally(finished);
  const newestRanked = finished.find((m) => m.ranked);
  const first = finished[0]!;
  let run = 0;
  while (run < finished.length && finished[run]!.won === first.won) run++;
  return {
    games: finished.length,
    wins,
    losses,
    winPct: Math.round((wins / finished.length) * 100),
    ranked: tally(finished.filter((m) => m.ranked)),
    casual: tally(finished.filter((m) => !m.ranked)),
    streak: { kind: first.won ? "W" : "L", count: run },
    recent: finished.slice(0, RECENT_GAMES).map((m) => (m.won ? "W" : "L")),
    rating: newestRanked ? newestRanked.rating_after : null,
  };
}
