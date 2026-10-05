import type { MatchHistoryEntry } from "../history/historyApi";

export type MatchOverFacts = {
  /** "Ended on turn 9", from the board's turn counter. */
  turns: string;
  /** "Bounty 1012 → 1028 (+16)" for a ranked game once the result is saved, else null. */
  rating: string | null;
  /** Where the turn-by-turn log lives (History), or null while there is none. */
  logPath: string | null;
};

/**
 * What the match-over card adds under the result. `record` is the saved match
 * (History's entry for this game); it lands a moment after the game ends and
 * never exists for guests, so every part that needs it stays null until then.
 */
export function matchOverFacts(turnNumber: number, record: MatchHistoryEntry | null): MatchOverFacts {
  const delta = record ? record.rating_after - record.rating_before : 0;
  return {
    turns: `Ended on turn ${turnNumber}`,
    rating:
      record?.ranked
        ? `Bounty ${record.rating_before} → ${record.rating_after} (${delta >= 0 ? "+" : "−"}${Math.abs(delta)})`
        : null,
    logPath: record?.has_log ? `/history/${encodeURIComponent(record.match_id)}` : null,
  };
}

/** Seconds to wait before each try at fetching the saved match; the server saves it a moment after the game. */
export const RECORD_RETRY_DELAYS_S = [0, 2, 5, 10, 20];
