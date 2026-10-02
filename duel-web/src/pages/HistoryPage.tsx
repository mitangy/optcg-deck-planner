import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { matchRow } from "../history/matchRow";
import { ApiError, googleLoginUrl } from "../net/api";
import "../history/history.css";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; matches: MatchHistoryEntry[] };

const cardName = (id: string) => lookupCard(id).name || id;

export function HistoryPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetchMatchHistory()
      .then((matches) => live && setState({ status: "ready", matches }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) setState({ status: "signed-out" });
        else setState({ status: "error", message: e instanceof Error ? e.message : "Could not load your matches" });
      });
    return () => {
      live = false;
    };
  }, []);

  const rows = useMemo(
    () => (state.status === "ready" ? state.matches.map((m) => matchRow(m, cardName)) : []),
    [state],
  );

  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <Link to="/" className="btn btn-ghost btn-sm page-back" aria-label="Back to home">
            ← Home
          </Link>
          <h1 className="page-title">Match history</h1>
        </header>

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
        {state.status === "ready" && rows.length === 0 ? (
          <section className="panel">
            <p className="panel-copy">No finished duels yet. Games against other signed-in players show up here.</p>
          </section>
        ) : null}

        {rows.length > 0 ? (
          <ol className="history-list">
            {rows.map((r) => (
              <li key={r.id} className="history-row" data-outcome={r.outcome === "Won" ? "won" : "lost"}>
                <span className="history-outcome">{r.outcome}</span>
                <div className="history-main">
                  <p className="history-leaders">
                    <span>{r.yourLeader}</span>
                    <span className="history-vs">vs</span>
                    <span>{r.opponentLeader}</span>
                  </p>
                  <p className="history-meta">
                    {[r.opponent, r.how, r.turns, r.when].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.bountyDelta ? <span className="history-bounty" title="Bounty change">{r.bountyDelta}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}

        {state.status === "ready" ? (
          <p className="field-hint history-hint">
            Want a coach's take? Add your Log Pose link from <Link to="/settings">Settings</Link> to Claude and ask it
            to review a game.
          </p>
        ) : null}
      </div>
    </div>
  );
}
