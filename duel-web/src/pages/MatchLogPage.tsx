import { PageShell } from "../layout/PageShell";
import { SignInLink } from "../analytics/SignInLink";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { CardInspect } from "../board/preview/CardInspect";
import { TONE_ICON } from "../board/panels/BattleLogPanel";
import type { LogSegment } from "../board/match/battleLog";
import { fetchMatchDetail, type MatchDetail } from "../history/historyApi";
import { groupHand, matchLogTurns } from "../history/matchLog";
import { matchRow, outcomeKey } from "../history/matchRow";
import { LeaderPair } from "../history/LeaderPair";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { useMediaQuery } from "../board/layout/useMediaQuery";
import { FINE_POINTER_QUERY } from "../board/preview/inspectGestures";
import { useClickCopy } from "../board/input/clickCopy";
import { openReport } from "../reports/reportDialog";
import { historyReportTarget } from "../reports/reportTargets";
import { ApiError } from "../net/api";
import { errorMessage } from "../lib/errors";
import { useAsyncResource } from "../lib/useAsyncResource";
import { useLogPose, useLogPosePage } from "@optcg/analyst-client";
import { matchLogScope } from "../logPoseScopes";
import { LogPoseReview } from "../history/LogPoseReview";
import { MATCH_LOG_STARTERS } from "../logPose";
import "../history/history.css";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: MatchDetail };

type Inspect = { defId: string; ownerSeat?: 0 | 1 };

const cardName = (id: string) => lookupCard(id).name || id;

const THUMB_W_REM = 9;
const THUMB_GAP = 8;

/** Where the hover thumbnail goes: beside the name, flipped above it near the bottom, clamped inside the viewport. */
function thumbPosition(r: DOMRect, rootPx: number, vw: number, vh: number): { left: number; top: number } {
  const w = THUMB_W_REM * rootPx;
  const h = w * 1.4;
  const left = Math.min(Math.max(THUMB_GAP, r.left + r.width / 2 - w / 2), Math.max(THUMB_GAP, vw - w - THUMB_GAP));
  const below = r.bottom + THUMB_GAP;
  const top = below + h <= vh - THUMB_GAP ? below : Math.max(THUMB_GAP, r.top - h - THUMB_GAP);
  return { left, top };
}

function CardButton({ defId, name, onInspect }: { defId: string; name: string; onInspect: () => void }) {
  const copy = useClickCopy();
  const fine = useMediaQuery(FINE_POINTER_QUERY);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = (el: HTMLElement) => {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    setPos(thumbPosition(el.getBoundingClientRect(), root, window.innerWidth, window.innerHeight));
  };
  return (
    <button
      type="button"
      className="log-card"
      title={copy(`${name} — tap to inspect`)}
      onClick={() => {
        setPos(null);
        onInspect();
      }}
      data-def={defId}
      onMouseEnter={fine ? (e) => show(e.currentTarget) : undefined}
      onMouseLeave={fine ? () => setPos(null) : undefined}
    >
      {name}
      {pos
        ? createPortal(<img className="log-card-thumb" src={resolveCardImageUrl(defId, { size: "thumb" })} alt="" style={pos} />, document.body)
        : null}
    </button>
  );
}

export function MatchLogPage() {
  const { matchId = "" } = useParams();
  const res = useAsyncResource(() => fetchMatchDetail(matchId), [matchId]);
  const state = useMemo<State>(() => {
    if (res.status === "ready") return { status: "ready", detail: res.data };
    if (res.status === "loading") return { status: "loading" };
    if (res.error instanceof ApiError && res.error.status === 401) return { status: "signed-out" };
    return { status: "error", message: errorMessage(res.error, "Could not load this match") };
  }, [res]);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const { available: logPoseAvailable, openLogPose } = useLogPose();

  const detail = state.status === "ready" ? state.detail : null;

  useEffect(() => {
    if (!detail || !/^#turn-\d+$/.test(window.location.hash)) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [detail]);
  const row = useMemo(() => (detail ? matchRow(detail.match, cardName) : null), [detail]);
  const reportTarget = useMemo(() => (detail ? historyReportTarget(detail.match) : null), [detail]);
  const turns = useMemo(() => (detail?.log ? matchLogTurns(detail.log) : []), [detail]);
  const intro = turns.find((t) => t.turn === 0);
  const playTurns = turns.filter((t) => t.turn > 0);
  const log = detail?.log ?? null;
  const jumpTo = (e: MouseEvent<HTMLAnchorElement>, turn: number) => {
    e.preventDefault();
    document.getElementById(`turn-${turn}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(window.history.state, "", `#turn-${turn}`);
  };
  const seat = log?.seat;
  const opponentSeat = seat === undefined ? undefined : ((1 - seat) as 0 | 1);
  const wentFirst = log ? log.turns.find((t) => t.turn === 1)?.activeSeat === log.seat : null;
  useLogPosePage(
    row ? { page: "match-log", label: `${row.yourLeader} vs ${row.opponentLeader}`, matchId, scope: matchLogScope(matchId, row.yourLeader, row.opponentLeader), starters: MATCH_LOG_STARTERS } : null,
  );

  const segment = (seg: LogSegment, i: number) =>
    seg.kind === "card" ? (
      <CardButton key={i} defId={seg.defId} name={seg.name} onInspect={() => setInspect({ defId: seg.defId, ownerSeat: seg.ownerSeat })} />
    ) : (
      <span key={i}>{seg.text}</span>
    );

  const handCards = (ids: string[], ownerSeat: 0 | 1 | undefined) =>
    groupHand(ids).map(({ defId, count }) => (
      <span key={defId} className="log-card-group">
        <CardButton defId={defId} name={cardName(defId)} onInspect={() => setInspect({ defId, ownerSeat })} />
        {count > 1 ? (
          <span className="log-card-count" title={`${count} copies`} aria-label={`${count} copies`} role="img">
            ×{count}
          </span>
        ) : null}
      </span>
    ));

  const renderTurn = (t: (typeof turns)[number]) => (
    <section
      key={t.turn}
      id={`turn-${t.turn}`}
      className="match-log-turn"
      data-yours={t.yours ? "true" : undefined}
    >
      <h2 className="match-log-turn-title">
        {t.turn > 0 ? <span className="match-log-turn-no">Turn {t.turn}</span> : null}
        <span>{t.label}</span>
      </h2>
      <div className="match-log-turn-body" data-hands={t.hand || t.opponentHand || t.opponentHandCount != null ? "true" : undefined}>
        {t.hand || t.opponentHand || t.opponentHandCount != null ? (
          <div className="match-log-turn-hand">
            {t.hand ? (
              t.hand.length ? (
                <div className="match-log-turn-hand-row">
                  <span className="match-log-turn-hand-label">Your hand ({t.hand.length})</span>
                  <p className="match-log-hand-cards match-log-turn-hand-cards">
                    {handCards(t.hand, seat)}
                  </p>
                </div>
              ) : (
                <span className="match-log-turn-hand-label">Your hand: empty</span>
              )
            ) : null}
            {t.opponentHand ? (
              t.opponentHand.length ? (
                <div className="match-log-turn-hand-row">
                  <span className="match-log-turn-hand-label">Opponent's hand ({t.opponentHand.length})</span>
                  <p className="match-log-hand-cards match-log-turn-hand-cards">
                    {handCards(t.opponentHand, opponentSeat)}
                  </p>
                </div>
              ) : (
                <span className="match-log-turn-hand-label">Opponent's hand: empty</span>
              )
            ) : t.opponentHandCount != null ? (
              <span className="match-log-turn-opp">Opponent: {t.opponentHandCount} {t.opponentHandCount === 1 ? "card" : "cards"}</span>
            ) : null}
          </div>
        ) : null}
        <ul className="battle-log-lines match-log-lines">
          {t.entries.map((line) => (
            <li key={line.id} className={`log-line log-${line.tone}${line.important ? " log-important" : ""}`}>
              <span className="log-icon" aria-hidden>
                {TONE_ICON[line.tone] ?? ""}
              </span>
              <span className="log-text">{line.segments.map(segment)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );

  return (
    <PageShell pageClass="match-log-page" back={{ to: "/history", label: "Match history", ariaLabel: "Back to match history" }} title="Match log" outside={inspect ? <CardInspect defId={inspect.defId} open onClose={() => setInspect(null)} ownerSeat={inspect.ownerSeat} viewingSeat={seat} /> : null}>
      {state.status === "loading" ? <p className="panel-copy history-note">Loading the match…</p> : null}
      {state.status === "error" ? (
        <section className="panel" role="alert">
          <p className="panel-copy">We couldn't load this match. {state.message}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={res.reload}>
              Try again
            </button>
          </div>
        </section>
      ) : null}
      {state.status === "signed-out" ? (
        <section className="panel">
          <p className="panel-copy">Sign in to see your match logs.</p>
          <div className="btn-row">
            <SignInLink className="btn btn-primary">
              Sign in with Google
            </SignInLink>
          </div>
        </section>
      ) : null}

      {row ? (
        <section className="history-row match-summary" data-outcome={outcomeKey(row.outcome)}>
          <LeaderPair yours={row.yourLeaderId} theirs={row.opponentLeaderId} />
          <div className="history-main">
            <p className="match-summary-result">
              <span className="history-outcome">{row.outcome}</span>
              <span className="history-tag" data-mode={row.mode.toLowerCase()}>{row.mode}</span>
            </p>
            <p className="history-leaders">
              <span>{row.yourLeader}</span>
              <span className="history-vs">vs</span>
              <span>{row.opponentLeader}</span>
            </p>
            <p className="history-opp">{row.opponent}</p>
            <p className="history-meta">
              {[row.how, row.turns, wentFirst == null ? null : wentFirst ? "You went first" : "You went second", row.when]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {row.bountyDelta ? <span className="history-bounty" title="Bounty change">{row.bountyDelta}</span> : null}
          {row.replay || reportTarget ? (
            <div className="match-summary-actions">
              {row.replay ? (
                <Link className="btn btn-primary btn-sm" to={`/replay/${encodeURIComponent(matchId)}`}>
                  Watch replay
                </Link>
              ) : null}
              {row.replay && row.outcome !== "Cut off" ? (
                <Link className="btn btn-secondary btn-sm" to={`/replay/${encodeURIComponent(matchId)}?review=1`}>
                  Review game
                </Link>
              ) : null}
              {reportTarget ? (
                <button type="button" className="btn btn-ghost btn-sm match-report-link" onClick={() => openReport(reportTarget)}>
                  Report opponent
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {playTurns.length ? (
        <nav className="match-log-jump" aria-label="Jump to turn">
          {playTurns.map((t) => (
            <a
              key={t.turn}
              href={`#turn-${t.turn}`}
              className="match-log-jump-chip"
              data-yours={t.yours ? "true" : undefined}
              title={`Turn ${t.turn}: ${t.label}`}
              onClick={(e) => jumpTo(e, t.turn)}
            >
              {t.turn}
            </a>
          ))}
        </nav>
      ) : null}

      {detail && !log ? (
        <section className="panel">
          <p className="panel-copy">
            No turn log was kept for this game.
          </p>
        </section>
      ) : null}

      {detail && detail.match.finished === false ? (
        <p className="field-hint history-hint" role="status">
          This game never finished (it was cut off or abandoned), so the log runs up to the last saved turn.
        </p>
      ) : null}

      {detail ? <LogPoseReview matchId={matchId} finished={detail.match.finished} /> : null}

      {log ? (
        <div className="match-log">
          <div className="match-log-openings">
            <section className="match-log-hand" aria-label="Your opening hand">
              <h2 className="match-log-turn-title">Your opening hand</h2>
              <p className="match-log-hand-cards">
                {handCards(log.openingHand, seat)}
              </p>
            </section>
            {log.opponentOpeningHand ? (
              <section className="match-log-hand" aria-label="Opponent's opening hand">
                <h2 className="match-log-turn-title">Opponent's opening hand</h2>
                <p className="match-log-hand-cards">
                  {handCards(log.opponentOpeningHand, opponentSeat)}
                </p>
              </section>
            ) : null}
          </div>
          {intro ? renderTurn(intro) : null}
          <div className="match-log-turns">
            {playTurns.map(renderTurn)}
          </div>
          {log.diverged ? (
            <p className="field-hint history-hint">The log stops early: card rules changed after this game was played.</p>
          ) : null}
        </div>
      ) : null}

      {log ? (
        <div className="match-log-foot">
          <p className="field-hint history-hint">
            {log.opponentOpeningHand ? "The opponent's hand is shown because the game is over. Their deck and face-down cards stay hidden." : "Only what you could see is shown: the opponent's hand and face-down cards stay hidden."}
          </p>
          {logPoseAvailable ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openLogPose()}>
              Review with Log Pose
            </button>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
