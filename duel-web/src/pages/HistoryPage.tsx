import { PageShell } from "../layout/PageShell";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { useArtFallback } from "../cards/useArtFallback";
import { historySummary } from "../history/historySummary";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { matchRow, outcomeKey } from "../history/matchRow";
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

const cardName = (id: string) => lookupCard(id).name || id;

/** Your Leader's art on a history row; a plain block when the art is missing or fails. */
function LeaderArt({ defId }: { defId: string | null }) {
  const { src, fail } = useArtFallback(defId ? resolveCardImageUrl(defId, { size: "thumb" }) : null, defId);
  return src ? (
    <img className="history-leader-art" src={src} alt="" loading="lazy" onError={fail} />
  ) : (
    <span className="history-leader-art history-leader-art-empty" aria-hidden />
  );
}

/** A small compass on a row whose game has a Log Pose chat. */
function ChatMark() {
  return (
    <span className="history-chat" role="img" aria-label="Has a Log Pose chat" title="You have a Log Pose chat about this game">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.5 14.2 12h-4.4zM12 17.5 9.8 12h4.4z" />
      </svg>
    </span>
  );
}

export function HistoryPage() {
  const res = useAsyncResource(() => fetchMatchHistory(), []);
  const state = useMemo<State>(() => {
    if (res.status === "ready") return { status: "ready", matches: res.data };
    if (res.status === "loading") return { status: "loading" };
    if (res.error instanceof ApiError && res.error.status === 401) return { status: "signed-out" };
    return { status: "error", message: errorMessage(res.error, "Could not load your matches") };
  }, [res]);
  const copy = useClickCopy();

  const summary = useMemo(() => (state.status === "ready" ? historySummary(state.matches) : null), [state]);
  const rows = useMemo(
    () => (state.status === "ready" ? state.matches.map((m) => matchRow(m, cardName)) : []),
    [state],
  );

  // Rows without a recording keep a blank slot so the rows with one stay aligned with them.
  const anyReplay = rows.some((r) => r.replay);

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
            <li key={r.id} className="history-item">
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
                    {r.hasChat ? <ChatMark /> : null}
                  </p>
                  <p className="history-meta">
                    {[r.opponent, r.how, r.turns, r.when].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.bountyDelta ? <span className="history-bounty" title="Bounty change">{r.bountyDelta}</span> : null}
                <span className="history-chevron" aria-hidden>›</span>
              </Link>
              {r.replay ? (
                <Link
                  className="history-replay-btn"
                  to={`/replay/${encodeURIComponent(r.id)}`}
                  aria-label={`Watch replay: ${r.yourLeader} vs ${r.opponentLeader}, ${r.opponent}`}
                  title="Watch this game again"
                >
                  <span aria-hidden>▶</span>
                  <span className="history-replay-label">Watch</span>
                </Link>
              ) : anyReplay ? (
                <span className="history-replay-slot" aria-hidden />
              ) : null}
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
    </PageShell>
  );
}
