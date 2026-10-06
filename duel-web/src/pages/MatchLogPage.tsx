import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { CardInspect } from "../board/CardInspect";
import { TONE_ICON } from "../board/BattleLogPanel";
import type { LogSegment } from "../board/battleLog";
import { fetchMatchDetail, type MatchDetail } from "../history/historyApi";
import { matchLogTurns } from "../history/matchLog";
import { matchRow, outcomeKey } from "../history/matchRow";
import { useClickCopy } from "../board/clickCopy";
import { ApiError, googleLoginUrl } from "../net/api";
import { BackLink } from "./BackLink";
import "../history/history.css";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: MatchDetail };

type Inspect = { defId: string; ownerSeat?: 0 | 1 };

const cardName = (id: string) => lookupCard(id).name || id;

function CardButton({ defId, name, onInspect }: { defId: string; name: string; onInspect: () => void }) {
  const copy = useClickCopy();
  return (
    <button type="button" className="log-card" title={copy(`${name} — tap to inspect`)} onClick={onInspect} data-def={defId}>
      {name}
    </button>
  );
}

export function MatchLogPage() {
  const { matchId = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [inspect, setInspect] = useState<Inspect | null>(null);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fetchMatchDetail(matchId)
      .then((detail) => live && setState({ status: "ready", detail }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) setState({ status: "signed-out" });
        else setState({ status: "error", message: e instanceof Error ? e.message : "Could not load this match" });
      });
    return () => {
      live = false;
    };
  }, [matchId]);

  const detail = state.status === "ready" ? state.detail : null;
  const row = useMemo(() => (detail ? matchRow(detail.match, cardName) : null), [detail]);
  const turns = useMemo(() => (detail?.log ? matchLogTurns(detail.log) : []), [detail]);
  const log = detail?.log ?? null;
  const seat = log?.seat;
  const opponentSeat = seat === undefined ? undefined : ((1 - seat) as 0 | 1);
  const wentFirst = log ? log.turns.find((t) => t.turn === 1)?.activeSeat === log.seat : null;

  const segment = (seg: LogSegment, i: number) =>
    seg.kind === "card" ? (
      <CardButton key={i} defId={seg.defId} name={seg.name} onInspect={() => setInspect({ defId: seg.defId, ownerSeat: seg.ownerSeat })} />
    ) : (
      <span key={i}>{seg.text}</span>
    );

  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <BackLink to="/history" label="History" ariaLabel="Back to match history" />
          <h1 className="page-title">Match log</h1>
        </header>

        {state.status === "loading" ? <p className="panel-copy history-note">Loading the match…</p> : null}
        {state.status === "error" ? <p className="panel-copy history-note" role="alert">{state.message}</p> : null}
        {state.status === "signed-out" ? (
          <section className="panel">
            <p className="panel-copy">Sign in to see your match logs.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={googleLoginUrl()}>
                Sign in with Google
              </a>
            </div>
          </section>
        ) : null}

        {row ? (
          <section className="history-row match-summary" data-outcome={outcomeKey(row.outcome)}>
            <span className="history-outcome">{row.outcome}</span>
            <div className="history-main">
              <p className="history-leaders">
                <span>{row.yourLeader}</span>
                <span className="history-vs">vs</span>
                <span>{row.opponentLeader}</span>
              </p>
              <p className="history-meta">
                {[row.opponent, row.how, row.turns, wentFirst == null ? null : wentFirst ? "You went first" : "You went second", row.when]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {row.bountyDelta ? <span className="history-bounty" title="Bounty change">{row.bountyDelta}</span> : null}
          </section>
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

        {log ? (
          <div className="match-log">
            <section className="match-log-hand" aria-label="Your opening hand">
              <h2 className="match-log-turn-title">Your opening hand</h2>
              <p className="match-log-hand-cards">
                {log.openingHand.map((defId, i) => (
                  <CardButton key={i} defId={defId} name={cardName(defId)} onInspect={() => setInspect({ defId, ownerSeat: seat })} />
                ))}
              </p>
            </section>
            {log.opponentOpeningHand ? (
              <section className="match-log-hand" aria-label="Opponent's opening hand">
                <h2 className="match-log-turn-title">Opponent's opening hand</h2>
                <p className="match-log-hand-cards">
                  {log.opponentOpeningHand.map((defId, i) => (
                    <CardButton key={i} defId={defId} name={cardName(defId)} onInspect={() => setInspect({ defId, ownerSeat: opponentSeat })} />
                  ))}
                </p>
              </section>
            ) : null}
            {turns.map((t) => (
              <section key={t.turn} className="match-log-turn" data-yours={t.yours ? "true" : undefined}>
                <h2 className="match-log-turn-title">
                  {t.turn > 0 ? <span className="match-log-turn-no">Turn {t.turn}</span> : null}
                  <span>{t.label}</span>
                </h2>
                {t.hand || t.opponentHand || t.opponentHandCount != null ? (
                  <div className="match-log-turn-hand">
                    {t.hand ? (
                      t.hand.length ? (
                        <div className="match-log-turn-hand-row">
                          <span className="match-log-turn-hand-label">Your hand ({t.hand.length})</span>
                          <p className="match-log-hand-cards match-log-turn-hand-cards">
                            {t.hand.map((defId, i) => (
                              <CardButton key={i} defId={defId} name={cardName(defId)} onInspect={() => setInspect({ defId, ownerSeat: seat })} />
                            ))}
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
                            {t.opponentHand.map((defId, i) => (
                              <CardButton key={i} defId={defId} name={cardName(defId)} onInspect={() => setInspect({ defId, ownerSeat: opponentSeat })} />
                            ))}
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
              </section>
            ))}
            {log.diverged ? (
              <p className="field-hint history-hint">The log stops early: card rules changed after this game was played.</p>
            ) : null}
          </div>
        ) : null}

        {log ? (
          <p className="field-hint history-hint">
            {log.opponentOpeningHand ? "The opponent's hand is shown because the game is over. Their deck and face-down cards stay hidden." : "Only what you could see is shown: the opponent's hand and face-down cards stay hidden."} For a coach's take,
            ask Log Pose in Claude to review this game (link in <Link to="/settings">Settings</Link>).
          </p>
        ) : null}
      </div>
      {inspect ? (
        <CardInspect defId={inspect.defId} open onClose={() => setInspect(null)} ownerSeat={inspect.ownerSeat} viewingSeat={seat} />
      ) : null}
    </div>
  );
}
