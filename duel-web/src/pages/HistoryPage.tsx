import { PageShell } from "../layout/PageShell";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { MatchHistoryList, RecordSummary } from "../history/MatchHistoryList";
import { useClickCopy } from "../board/input/clickCopy";
import { ApiError, googleLoginUrl } from "../net/api";
import { errorMessage } from "../lib/errors";
import { useAsyncResource } from "../lib/useAsyncResource";
import "../history/history.css";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; matches: MatchHistoryEntry[] };

export function HistoryPage() {
  const res = useAsyncResource(() => fetchMatchHistory(), []);
  const state = useMemo<State>(() => {
    if (res.status === "ready") return { status: "ready", matches: res.data };
    if (res.status === "loading") return { status: "loading" };
    if (res.error instanceof ApiError && res.error.status === 401) return { status: "signed-out" };
    return { status: "error", message: errorMessage(res.error, "Could not load your matches") };
  }, [res]);
  const copy = useClickCopy();

  return (
    <PageShell pageClass="page-narrow" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Match history">

      {state.status === "loading" ? <p className="panel-copy history-note">Loading your matches…</p> : null}
      {state.status === "error" ? <p className="panel-copy history-note" role="alert">{state.message}</p> : null}
      {state.status === "signed-out" ? (
        <section className="panel">
          <p className="panel-copy">Sign in to keep a history of your duels.</p>
          <div className="btn-row">
            <a className="btn btn-primary" href={googleLoginUrl()}>
              Sign in with Google
            </a>
          </div>
        </section>
      ) : null}
      {state.status === "ready" && state.matches.length === 0 ? (
        <section className="panel">
          <p className="panel-copy">No finished duels yet. Games against other signed-in players show up here.</p>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <RecordSummary matches={state.matches} />
          <MatchHistoryList matches={state.matches} />
        </>
      ) : null}

      {state.status === "ready" ? (
        <p className="field-hint history-hint">
          {copy("Tap a game to read it turn by turn.")} Want a coach's take? Add your Log Pose link from{" "}
          <Link to="/settings">Settings</Link> to Claude and ask it to review a game.
        </p>
      ) : null}
    </PageShell>
  );
}
