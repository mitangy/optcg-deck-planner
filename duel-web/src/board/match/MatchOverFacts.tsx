import { useEffect, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { useLogPose } from "@optcg/analyst-client";
import type { MatchHistoryEntry } from "../../history/historyApi";
import type { ReplayNavState } from "../../replay/replayRetry";
import { matchOverFacts, pollMatchRecord } from "./matchOverFactsModel";

export type LoadMatchRecord = (matchId: string) => Promise<MatchHistoryEntry>;

// The saved match arrives a moment after the game ends (and never for guests), so it is fetched a few times.
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
    return pollMatchRecord(matchId, loadRecord, setRecord);
  }, [matchId, loadRecord]);

  const { enabled: logPose } = useLogPose();
  const inRouter = useInRouterContext();
  const facts = matchOverFacts(turnNumber, record);
  return (
    <>
      <p className="match-result-facts">
        {facts.turns}
        {facts.rating ? <span className="match-result-rating"> · {facts.rating}</span> : null}
      </p>
      {loadRecord && inRouter ? (
        // The slot keeps its height while the saved match is on its way, so the card does not grow when the button lands.
        <div className="match-result-review-slot">
          {facts.replayPath ? (
            <Link className="btn btn-primary match-result-replay" to={facts.replayPath} state={{ fromMatchOver: true } satisfies ReplayNavState}>
              Review game
            </Link>
          ) : null}
        </div>
      ) : null}
      {facts.logPath ? (
        <a className="match-result-log" href={facts.logPath} target="_blank" rel="noopener noreferrer">
          View match log
        </a>
      ) : null}
      {facts.logPath && logPose ? (
        // Same page as the log (its analysis section reviews the game), in a new tab so the rematch offer stays open.
        <a className="match-result-log match-result-review" href={facts.logPath} target="_blank" rel="noopener noreferrer">
          Review with Log Pose
        </a>
      ) : null}
    </>
  );
}
