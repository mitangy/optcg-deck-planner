import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { historySummary } from "../history/historySummary";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { matchRow, outcomeKey } from "../history/matchRow";
import { useClickCopy } from "../board/clickCopy";
import { ApiError, googleLoginUrl } from "../net/api";
import { BackLink } from "./BackLink";
import "../history/history.css";
import { NavMenu } from "../nav/NavMenu";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; matches: MatchHistoryEntry[] };

const cardName = (id: string) => lookupCard(id).name || id;

/** Your Leader's art on a history row; a plain block when the art is missing or fails. */
function LeaderArt({ defId }: { defId: string | null }) {
  const src = defId ? resolveCardImageUrl(defId, { size: "thumb" }) : null;
  const [failed, setFailed] = useState<string | null>(null);
  return src && src !== failed ? (
    <img className="history-leader-art" src={src} alt="" loading="lazy" onError={() => setFailed(src)} />
  ) : (
    <span className="history-leader-art history-leader-art-empty" aria-hidden />
  );
}

export function HistoryPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const copy = useClickCopy();

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

  const summary = useMemo(() => (state.status === "ready" ? historySummary(state.matches) : null), [state]);
  const rows = useMemo(
    () => (state.status === "ready" ? state.matches.map((m) => matchRow(m, cardName)) : []),
    [state],
  );

  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
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

        {summary ? (
          <dl className="history-summary" aria-label="Your record">
            <div>
              <dt>Record</dt>
              <dd>
                {summary.wins}-{summary.losses}
              </dd>
            </div>
            {summary.rating != null ? (
              <div>
                <dt>Bounty</dt>
                <dd>{summary.rating}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {rows.length > 0 ? (
          <ol className="history-list">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/history/${encodeURIComponent(r.id)}`}
                  className="history-row history-row-link"
                  data-outcome={outcomeKey(r.outcome)}
                >
                  <span className="history-outcome">{r.outcome}</span>
                  <LeaderArt defId={r.yourLeaderId} />
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
                  <span className="history-chevron" aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}

        {state.status === "ready" ? (
          <p className="field-hint history-hint">
            {copy("Tap a game to read it turn by turn.")} Want a coach's take? Add your Log Pose link from{" "}
            <Link to="/settings">Settings</Link> to Claude and ask it to review a game.
          </p>
        ) : null}
      </div>
    </div>
  );
}
