import { PageShell } from "../layout/PageShell";
import { SignInLink } from "../analytics/SignInLink";
import { useMemo } from "react";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { MatchHistoryList, MatchHistorySkeleton, RecordSummary } from "../history/MatchHistoryList";
import { useClickCopy } from "../board/input/clickCopy";
import { ApiError } from "../net/api";
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
    <PageShell pageClass="history-page" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Match history">

      {state.status === "loading" ? <MatchHistorySkeleton /> : null}
      {state.status === "error" ? (
        <section className="panel history-error" role="alert">
          <p className="panel-copy">We couldn't load your matches. {state.message}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={res.reload}>
              Try again
            </button>
          </div>
        </section>
      ) : null}
      {state.status === "signed-out" ? (
        <section className="panel">
          <p className="panel-copy">Sign in to keep a history of your duels.</p>
          <div className="btn-row">
            <SignInLink className="btn btn-primary">
              Sign in with Google
            </SignInLink>
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

      {state.status === "ready" && state.matches.length > 0 ? <p className="field-hint history-hint">{copy("Tap a game to read it turn by turn.")}</p> : null}
    </PageShell>
  );
}
