import type { MatchHistoryEntry } from "../../history/historyApi";

export type MatchOverFacts = {
  turns: string;
  rating: string | null;
  logPath: string | null;
  replayPath: string | null;
};

export function matchOverFacts(turnNumber: number, record: MatchHistoryEntry | null): MatchOverFacts {
  const delta = record ? record.rating_after - record.rating_before : 0;
  return {
    turns: `Ended on turn ${turnNumber}`,
    rating:
      record?.ranked
        ? `Bounty ${record.rating_before} → ${record.rating_after} (${delta >= 0 ? "+" : "−"}${Math.abs(delta)})`
        : null,
    logPath: record?.has_log ? `/history/${encodeURIComponent(record.match_id)}` : null,
    replayPath: record?.replay_ready === true ? `/replay/${encodeURIComponent(record.match_id)}` : null,
  };
}

// The server saves the match a moment after the game.
export const RECORD_RETRY_DELAYS_S = [0, 2, 5, 10, 20];

// A 404, or an entry not finished yet (the live per-turn save has no rating), is retried.
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
