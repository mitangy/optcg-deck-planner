/** The game review (#967) on the replay controls: the grade badge, the strip under the controls, and the summary. */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  CLASS_LABEL,
  keyMoments,
  moveStatus,
  pct,
  showBestRequest,
  summaryRows,
  turnLabel,
  winAt,
  type KeyMoment,
  type MoveClass,
  type ReviewedMove,
  type Seat,
  type TurnMark,
} from "./reviewModel";
import type { ReviewState } from "./useGameReview";

const ESTIMATE_NOTE = "Grades are bot-simulation estimates.";

/** The class's mark inside its disc (24x24 box). Shapes, not colour, tell the classes apart. */
function Glyph({ cls }: { cls: MoveClass }) {
  switch (cls) {
    case "best":
      return <path d="M12 5.2l1.95 4.3 4.7.5-3.5 3.2 1 4.6L12 15.4l-4.15 2.4 1-4.6-3.5-3.2 4.7-.5z" />;
    case "great":
      return (
        <>
          <path d="M10.5 5.5h3l-.55 8h-1.9z" />
          <circle cx="12" cy="17.2" r="1.6" />
        </>
      );
    case "excellent":
      return <path transform="translate(5.6 5.4) scale(.52)" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />;
    case "good":
      return <path d="M6.8 12.4l3.4 3.5 7-7.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />;
    default: {
      const text = cls === "inaccuracy" ? "?!" : cls === "mistake" ? "?" : "??";
      return (
        <text x="12" y="16.6" textAnchor="middle" fontSize={text.length > 1 ? 12 : 15} fontWeight="800" fontFamily="inherit">
          {text}
        </text>
      );
    }
  }
}

/** A chess.com-style grade badge: a coloured disc with the class's mark. The name is for screen readers (and always shown beside it). */
export function GradeBadge({ cls, size = 22, label = true }: { cls: MoveClass; size?: number; label?: boolean }) {
  return (
    <svg className={`rv-badge rv-${cls}`} viewBox="0 0 24 24" width={size} height={size} role={label ? "img" : undefined} aria-label={label ? CLASS_LABEL[cls] : undefined} aria-hidden={label ? undefined : true} focusable="false">
      <circle cx="12" cy="12" r="11.5" className="rv-disc" />
      <g className="rv-glyph">
        <Glyph cls={cls} />
      </g>
    </svg>
  );
}

/** A small mark for the turn list. */
export function TurnGlyph({ mark }: { mark: TurnMark }) {
  return mark === "good" ? (
    <span className="rv-turn-mark rv-turn-good" title="Good turn" aria-label="good turn">
      ▲
    </span>
  ) : (
    <span className="rv-turn-mark rv-turn-bad" title="A mistake this turn" aria-label="mistake">
      ●
    </span>
  );
}

export type ReviewViewer = { step: number; total: number; branch: boolean; yourSeat: Seat; playerNames: [string, string] };

/**
 * The strip under the controls: the win-chance line, then the grade of the move that led here with the best
 * alternative. It is always the same height (rows are reserved), so results arriving or a new text never move the controls.
 */
export function ReviewStrip({ review, viewer, onShowBest }: { review: ReviewState; viewer: ReviewViewer; onShowBest(step: number, moves: ReturnType<typeof showBestRequest>["moves"]): string | null }) {
  const { step, total, branch, yourSeat } = viewer;
  const running = review.status === "running";
  const status = moveStatus(review.review, { done: review.status === "done", progress: review.progress }, step, branch, total);
  const win = branch ? null : winAt(review.review, step, yourSeat);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setProblem(null), [step, branch]);

  let head: ReactNode;
  let best: ReactNode = null;
  let canShowBest: ReviewedMove | null = null;
  if (review.status === "failed" && !review.review) {
    head = <span className="rv-muted">Grades are unavailable for this game</span>;
  } else if (status.kind === "move") {
    const m = status.move;
    head = (
      <>
        {m.cls ? <GradeBadge cls={m.cls} /> : <span className="rv-badge rv-none" aria-hidden />}
        <span className="rv-text">
          <strong className={m.cls ? `rv-ink rv-ink-${m.cls}` : undefined}>{m.cls ? CLASS_LABEL[m.cls] : "Not ranked"}</strong>
          <span className="rv-label" title={m.played.label}>
            {m.played.label}
            {m.playedWin != null ? ` · ${pct(m.playedWin)}` : ""}
          </span>
        </span>
      </>
    );
    const isBest = m.cls === "best" || m.cls === "great";
    if (m.options > 0 && !isBest) {
      canShowBest = m;
      best = (
        <span className="rv-alt-text" title={`Best: ${m.best.label} (${pct(m.bestWin)})`}>
          Best: {m.best.label} <span className="rv-muted">({pct(m.bestWin)})</span>
        </span>
      );
    } else best = <span className="rv-alt-text rv-muted">{isBest ? "The best option here" : ""}</span>;
  } else {
    const text =
      status.kind === "line"
        ? "Your own line is not graded"
        : status.kind === "start"
          ? "Step through the game to see each move graded"
          : status.kind === "forced"
            ? "Only move"
            : status.kind === "stopped"
              ? "Not reviewed: the replay stops before here"
              : `Reviewing the game… ${Math.round(review.progress * 100)}%`;
    head = <span className="rv-muted rv-neutral">{text}</span>;
  }

  const barStyle: CSSProperties = { width: `${running ? Math.round(review.progress * 100) : win == null ? 0 : Math.round(win)}%` };
  return (
    <div className={`replay-review${running ? " rv-running" : ""}`} aria-label="Move grade" data-rv-state={status.kind}>
      <div className="rv-eval" title="Estimated from bot simulations">
        <span className="rv-eval-track" aria-hidden>
          <span className={running ? "rv-eval-progress" : "rv-eval-fill"} style={barStyle} />
        </span>
        <span className="rv-eval-text">
          {running ? `Reviewing… ${Math.round(review.progress * 100)}%` : win == null ? "Win chance (est.)" : `You ${pct(win)} (est.)`}
        </span>
      </div>
      <div className="rv-move" role="status" aria-live="polite">
        {head}
        {problem ? <span className="rv-problem-compact rv-bad">{problem}</span> : null}
      </div>
      <div className="rv-alt">{problem ? <span className="rv-alt-text rv-bad">{problem}</span> : best}</div>
      {canShowBest ? (
        <button
          type="button"
          className="replay-line-btn rv-show"
          aria-label="Show best move"
          title={`Play ${canShowBest.best.label} from here`}
          onClick={() => {
            const req = showBestRequest(canShowBest!);
            setProblem(onShowBest(req.step, req.moves));
          }}
        >
          Show best
        </button>
      ) : null}
    </div>
  );
}

function momentTitle(m: KeyMoment): string {
  if (m.kind === "goodTurn") return "Good turn";
  return CLASS_LABEL[m.cls];
}

/** The summary: accuracy and counts per player, then the moments worth going to. */
export function ReviewSummary({
  review,
  viewer,
  onGo,
  onClose,
  headingRef,
  grip = null,
  now = null,
}: {
  review: ReviewState;
  viewer: ReviewViewer;
  onGo(step: number): void;
  onClose(): void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  /** The floating panel's keyboard move grip (desktop). */
  grip?: ReactNode;
  /** The move the replay is at, in full (phones: the strip there keeps to two lines, #986). */
  now?: ReviewedMove | null;
}) {
  const { playerNames, yourSeat } = viewer;
  const r = review.review;
  const running = review.status === "running";
  const moments = keyMoments(r);
  const rows = summaryRows(r);
  const name = (seat: Seat) => (seat === yourSeat ? "You" : playerNames[seat] || `Player ${seat + 1}`);
  return (
    <div className="rv-summary">
      <div className="rv-summary-head">
        {grip}
        <h2 className="rv-summary-title" tabIndex={-1} ref={headingRef}>
          Game review
        </h2>
        <button type="button" className="replay-line-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="rv-summary-status" role="status">
        {running ? `Reviewing the game… ${Math.round(review.progress * 100)}%` : review.status === "failed" ? "The review stopped early. Showing what it graded." : ESTIMATE_NOTE}
      </p>
      {now ? (
        <div className="rv-now" aria-label="The move on screen">
          <div className="rv-now-head">
            {now.cls ? <GradeBadge cls={now.cls} size={18} /> : null}
            <strong className={now.cls ? `rv-ink rv-ink-${now.cls}` : undefined}>{now.cls ? CLASS_LABEL[now.cls] : "Not ranked"}</strong>
            <span className="rv-muted">the move on screen</span>
          </div>
          <p className="rv-now-line">
            {now.played.label}
            {now.playedWin != null ? ` · ${pct(now.playedWin)}` : ""}
          </p>
          {now.options > 0 && now.cls !== "best" && now.cls !== "great" ? (
            <p className="rv-now-line">
              Best: {now.best.label} <span className="rv-muted">({pct(now.bestWin)})</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {running ? (
        <div className="rv-progress" aria-hidden>
          <span style={{ width: `${Math.round(review.progress * 100)}%` }} />
        </div>
      ) : null}
      <table className="rv-table">
        <thead>
          <tr>
            <th scope="col" className="rv-table-corner">
              <span className="rv-sr">Move grade</span>
            </th>
            {([0, 1] as const).map((seat) => (
              <th key={seat} scope="col" title={playerNames[seat]}>
                <span className="rv-table-name">{name(seat)}</span>
              </th>
            ))}
          </tr>
          <tr className="rv-accuracy">
            <th scope="row">Accuracy</th>
            {([0, 1] as const).map((seat) => (
              <td key={seat}>{r?.seats[seat].accuracy != null ? Math.round(r.seats[seat].accuracy!) : "–"}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cls} className={row.counts[0] + row.counts[1] === 0 ? "rv-zero" : undefined}>
              <th scope="row">
                <GradeBadge cls={row.cls} size={16} label={false} />
                <span className={`rv-ink rv-ink-${row.cls}`}>{CLASS_LABEL[row.cls]}</span>
              </th>
              <td>{row.counts[0]}</td>
              <td>{row.counts[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="rv-moments-title">Key moments</h3>
      {moments.length === 0 ? (
        <p className="rv-muted rv-empty">{running ? "Moments appear as the review goes." : "No blunders, mistakes or great moves."}</p>
      ) : (
        <ul className="rv-moments">
          {moments.map((m, i) => (
            <li key={`${m.kind}-${m.step}-${i}`}>
              <button type="button" className="rv-moment" onClick={() => onGo(m.step)}>
                {m.kind === "goodTurn" ? <span className="rv-badge rv-turn-badge" aria-hidden>▲</span> : <GradeBadge cls={m.cls} size={20} label={false} />}
                <span className="rv-moment-text">
                  <span className="rv-moment-top">
                    <strong className={m.kind === "move" ? `rv-ink rv-ink-${m.cls}` : "rv-ink rv-ink-best"}>{momentTitle(m)}</strong>
                    <span className="rv-muted">
                      {turnLabel(m.turn)} · {name(m.seat)}
                    </span>
                  </span>
                  <span className="rv-moment-sub">
                    {m.kind === "goodTurn"
                      ? m.gain != null
                        ? `Win chance up ${Math.round(m.gain)} points over the turn`
                        : "A strong turn"
                      : m.cls === "great"
                        ? m.move.played.label
                        : `${m.move.played.label} → best: ${m.move.best.label}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
