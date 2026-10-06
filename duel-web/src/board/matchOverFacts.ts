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

/**
 * Fetches the saved match on the RECORD_RETRY_DELAYS_S schedule until a finished
 * entry lands, then hands it to `onRecord`. A miss (404) or an entry that is not
 * finished yet (the live game's per-turn save, which has no rating) is retried.
 * Returns a cancel function.
 */
export function pollMatchRecord(
  matchId: string,
  load: (matchId: string) => Promise<MatchHistoryEntry>,
  onRecord: (entry: MatchHistoryEntry) => void,
): () => void {
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (i: number) => {
    const retry = () => {
      if (live && i + 1 < RECORD_RETRY_DELAYS_S.length) attempt(i + 1);
    };
    timer = setTimeout(() => {
      load(matchId).then((entry) => {
        if (!live) return;
        if (entry.finished === false) retry();
        else onRecord(entry);
      }, retry);
    }, RECORD_RETRY_DELAYS_S[i]! * 1000);
  };
  attempt(0);
  return () => {
    live = false;
    clearTimeout(timer);
  };
}
