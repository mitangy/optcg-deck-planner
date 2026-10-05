import { useEffect, useState } from "react";
import type { MatchHistoryEntry } from "../history/historyApi";
import { matchOverFacts, RECORD_RETRY_DELAYS_S } from "./matchOverFacts";

/** Loads the saved match for History facts (rating, log); resolves to its entry or throws. */
export type LoadMatchRecord = (matchId: string) => Promise<MatchHistoryEntry>;

/**
 * Turn count, rating change and a "View match log" link for the match-over
 * card. The saved match arrives a moment after the game ends (and never for
 * guests), so it is fetched a few times and the extra lines appear when it lands.
 */
export function MatchOverFactsList({
  matchId,
  turnNumber,
  loadRecord,
}: {
  matchId: string | null;
  turnNumber: number;
  loadRecord?: LoadMatchRecord;
}) {
  const [record, setRecord] = useState<MatchHistoryEntry | null>(null);

  useEffect(() => {
    if (!matchId || !loadRecord) return;
    let live = true;
    let timer: number | undefined;
    const attempt = (i: number) => {
      timer = window.setTimeout(() => {
        loadRecord(matchId).then(
          (entry) => live && setRecord(entry),
          () => {
            if (live && i + 1 < RECORD_RETRY_DELAYS_S.length) attempt(i + 1);
          },
        );
      }, RECORD_RETRY_DELAYS_S[i]! * 1000);
    };
    attempt(0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [matchId, loadRecord]);

  const facts = matchOverFacts(turnNumber, record);
  return (
    <>
      <p className="match-result-facts">
        {facts.turns}
        {facts.rating ? <span className="match-result-rating"> · {facts.rating}</span> : null}
      </p>
      {facts.logPath ? (
        <a className="match-result-log" href={facts.logPath} target="_blank" rel="noopener noreferrer">
          View match log
        </a>
      ) : null}
    </>
  );
}
