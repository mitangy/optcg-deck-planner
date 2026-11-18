import { useEffect, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { useLogPose } from "@optcg/analyst-client";
import type { MatchHistoryEntry } from "../../history/historyApi";
import type { ReplayNavState } from "../../replay/replayRetry";
import { matchOverFacts, pollMatchRecord, type MatchOverFacts } from "./matchOverFactsModel";

export type LoadMatchRecord = (matchId: string) => Promise<MatchHistoryEntry>;

// The saved match arrives a moment after the game ends (and never for guests), so it is fetched a few times.
export function useMatchOverFacts(
  matchId: string | null,
  turnNumber: number,
  loadRecord?: LoadMatchRecord,
): MatchOverFacts {
  const [record, setRecord] = useState<MatchHistoryEntry | null>(null);
  useEffect(() => {
    if (!matchId || !loadRecord) return;
    return pollMatchRecord(matchId, loadRecord, setRecord);
  }, [matchId, loadRecord]);
  return matchOverFacts(turnNumber, record);
}

export function MatchOverFactsLine({ facts }: { facts: MatchOverFacts }) {
  return (
    <p className="match-result-facts">
      {facts.turns}
      {facts.rating ? <span className="match-result-rating"> · {facts.rating}</span> : null}
    </p>
  );
}

// Keeps its share of the row while the saved match is on its way, so the other buttons do not move when it lands.
export function ReviewGameSlot({ facts, enabled }: { facts: MatchOverFacts; enabled: boolean }) {
  const inRouter = useInRouterContext();
  if (!enabled || !inRouter) return null;
  return (
    <div className="match-result-review-slot">
      {facts.replayPath ? (
        <Link className="btn btn-secondary match-result-replay" to={facts.replayPath} state={{ fromMatchOver: true } satisfies ReplayNavState}>
          Review game
        </Link>
      ) : null}
    </div>
  );
}

export function MatchLogLinks({ facts }: { facts: MatchOverFacts }) {
  const { enabled: logPose } = useLogPose();
  if (!facts.logPath) return null;
  return (
    <p className="match-result-links">
      <a className="match-result-log" href={facts.logPath} target="_blank" rel="noopener noreferrer">
        View match log
      </a>
      {logPose ? (
        // Same page as the log (its analysis section reviews the game), in a new tab so the rematch offer stays open.
        <a className="match-result-log match-result-review" href={facts.logPath} target="_blank" rel="noopener noreferrer">
          Review with Log Pose
        </a>
      ) : null}
    </p>
  );
}
