import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, Select } from "@optcg/ui/popups";
import { DESKTOP_BOARD_QUERY, useMediaQuery } from "../board/useMediaQuery";
import { isTyping } from "../board/useBoardHotkeys";
import { PLAY_SPEEDS, type PlaySpeed } from "./replayCursor";
import type { ReplayControlsActions, ReplayControlsState } from "./useReplay";
import { moveStatus, reviewTicks, turnMarks } from "./reviewModel";
import { ReviewStrip, ReviewSummary, TurnGlyph } from "./ReviewUi";
import { ReviewPanel } from "./ReviewPanel";
import type { ReviewState } from "./useGameReview";
import "./replay.css";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

const ICONS = {
  prevTurn: (
    <Icon>
      <path d="M5 5h2v14H5zM20 5v14L9 12z" />
    </Icon>
  ),
  back: (
    <Icon>
      <path d="M17 5v14L6 12z" />
    </Icon>
  ),
  play: (
    <Icon>
      <path d="M7 4v16l13-8z" />
    </Icon>
  ),
  pause: (
    <Icon>
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </Icon>
  ),
  forward: (
    <Icon>
      <path d="M7 5v14l11-7z" />
    </Icon>
  ),
  nextTurn: (
    <Icon>
      <path d="M17 5h2v14h-2zM4 5v14l11-7z" />
    </Icon>
  ),
};

/** Keys that drive the replay: Space plays or pauses, ← / → step, Shift+← / → change turn. */
export function replayKeyAction(e: Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">):
  | "toggle"
  | "back"
  | "forward"
  | "prevTurn"
  | "nextTurn"
  | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === " " || e.code === "Space") return "toggle";
  if (e.key === "ArrowLeft") return e.shiftKey ? "prevTurn" : "back";
  if (e.key === "ArrowRight") return e.shiftKey ? "nextTurn" : "forward";
  return null;
}

/** Controls whose own keys (or Space) must win over the replay's. */
const OWN_KEYS = "input, select, textarea, [contenteditable=true], [role=dialog], [aria-modal=true]";

export function ReplayControls({
  state,
  actions,
  note = null,
  resultSlot = null,
  reserveRow = false,
  review = null,
}: {
  state: ReplayControlsState;
  actions: ReplayControlsActions;
  note?: ReactNode;
  resultSlot?: ReactNode;
  reserveRow?: boolean;
  /** The game review (#967), for a finished game; null for one that never ended. */
  review?: ReviewState | null;
}) {
  const { step, total, turn, turns, playing, speed, revealAll, yourSeat, playerNames, branch } = state;
  // Desktop has room for every control; phones keep the transport, scrubber and mode toggle, and tuck the rest behind More.
  const compact = !useMediaQuery(DESKTOP_BOARD_QUERY);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reviewBtnRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const showReview = review != null && review.status !== "off";
  useEffect(() => {
    if (!reviewOpen || compact) return;
    headingRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setReviewOpen(false);
      reviewBtnRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen, compact]);
  const viewer = { step, total, branch: branch != null, yourSeat, playerNames };
  const marks = turnMarks(review?.review ?? null, yourSeat);
  const ticks = reviewTicks(review?.review ?? null, total);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = replayKeyAction(e);
      if (!action) return;
      const active = document.activeElement;
      if (isTyping(active) || active?.closest(OWN_KEYS)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // A focused button or link takes Space itself.
      if (action === "toggle" && active?.matches("button, a")) return;
      e.preventDefault();
      if (action === "toggle") actions.togglePlay();
      else if (action === "back") actions.stepBy(-1);
      else if (action === "forward") actions.stepBy(1);
      else if (action === "prevTurn") actions.prevTurn();
      else actions.nextTurn();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  const youName = playerNames[yourSeat] || "You";

  const turnSelect = (
    <label className="replay-field">
      <span className={`replay-field-label${showReview && !compact ? " replay-field-label-hidden" : ""}`}>Turn</span>
      <Select
        buttonClassName="replay-select"
        value={turn}
        onChange={actions.goTurn}
        aria-label="Jump to turn"
        options={turns.map((t) => {
          const mark = marks.get(t.turn);
          return {
            value: t.turn,
            label: mark ? (
              <span className="rv-turn-option">
                {t.turn}
                <TurnGlyph mark={mark} />
              </span>
            ) : (
              t.turn
            ),
            buttonLabel: showReview && !compact ? `Turn ${t.turn}` : t.turn,
          };
        })}
      />
    </label>
  );
  const speedSelect = (
    <label className="replay-field">
      <span className={`replay-field-label${showReview && !compact ? " replay-field-label-hidden" : ""}`}>Speed</span>
      <Select
        buttonClassName="replay-select"
        value={speed}
        onChange={actions.setSpeed}
        aria-label="Playback speed"
        options={PLAY_SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
      />
    </label>
  );
  const reviewButton = showReview ? (
    <button
      type="button"
      className={`replay-btn replay-review-btn${reviewOpen ? " is-open" : ""}`}
      ref={reviewBtnRef}
      aria-label="Game review"
      aria-expanded={reviewOpen}
      title="Game review: accuracy and key moments (bot-simulation estimates)"
      onClick={() => setReviewOpen((open) => !open)}
    >
      <Icon>
        <path d="M5 20V10h3.5v10H5zm5.25 0V4h3.5v16h-3.5zM15.5 20v-7H19v7h-3.5z" />
      </Icon>
      <span className="replay-review-btn-text">Review</span>
    </button>
  ) : null;
  // Phones' strip keeps to two lines, so the sheet spells out the move on screen in full.
  const now = compact && showReview ? moveStatus(review.review, { done: review.status === "done", progress: review.progress }, step, branch != null, total) : null;
  const summary = (grip?: ReactNode) =>
    showReview ? (
    <ReviewSummary
      review={review}
      viewer={viewer}
      headingRef={headingRef}
      grip={grip}
      now={now?.kind === "move" ? now.move : null}
      onClose={() => {
        setReviewOpen(false);
        reviewBtnRef.current?.focus();
      }}
      onGo={(target) => {
        actions.goTo(target);
        // A sheet covers the board: leave it so the moment can be seen.
        if (compact) setReviewOpen(false);
      }}
    />
    ) : null;
  return (
    <div className={`replay-controls${compact ? " replay-compact" : ""}`} role="group" aria-label="Replay controls" ref={rootRef}>
      {note || reserveRow || resultSlot ? (
        <p className="replay-note" role="status">
          {resultSlot ?? note}
        </p>
      ) : null}
      {showReview ? <ReviewStrip review={review} viewer={viewer} onShowBest={(at, moves) => actions.startBranch(at, moves)} /> : null}
      <div className="replay-row replay-transport">
        <button type="button" className="replay-btn" aria-label="Previous turn" title="Previous turn (Shift+←)" onClick={actions.prevTurn} disabled={step === 0}>
          {ICONS.prevTurn}
        </button>
        <button type="button" className="replay-btn" aria-label="Step back" title="Step back (←)" onClick={() => actions.stepBy(-1)} disabled={step === 0}>
          {ICONS.back}
        </button>
        <button
          type="button"
          className="replay-btn replay-play"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          onClick={actions.togglePlay}
        >
          {playing ? ICONS.pause : ICONS.play}
        </button>
        <button type="button" className="replay-btn" aria-label="Step forward" title="Step forward (→)" onClick={() => actions.stepBy(1)} disabled={step >= total}>
          {ICONS.forward}
        </button>
        <button type="button" className="replay-btn" aria-label="Next turn" title="Next turn (Shift+→)" onClick={actions.nextTurn} disabled={step >= total}>
          {ICONS.nextTurn}
        </button>
      </div>

      <div className="replay-row replay-scrub">
        <div className="replay-range-wrap">
        <input
          type="range"
          className="replay-range"
          min={0}
          max={total}
          step={1}
          value={step}
          aria-label="Position in the game"
          aria-valuetext={`Step ${step} of ${total}, turn ${turn}`}
          onChange={(e) => actions.goTo(Number(e.target.value))}
        />
        {ticks.length ? (
          <span className="rv-ticks" aria-hidden>
            {ticks.map((t, i) => (
              <span key={i} className={`rv-tick rv-tick-${t.cls} ${t.seat === yourSeat ? "rv-tick-you" : "rv-tick-foe"}`} style={{ "--f": t.frac } as React.CSSProperties} />
            ))}
          </span>
        ) : null}
        </div>
        <span className="replay-readout" aria-hidden>
          {compact ? `T${turn} · ` : ""}
          {step}/{total}
        </span>
      </div>

      {compact ? null : (
        <div className="replay-row replay-pick">
          {turnSelect}
          {speedSelect}
          {reviewButton}
        </div>
      )}

      <div className="replay-row">
        {branch ? (
          // Your own line: the bar takes the mode toggle's row, so nothing moves when it opens.
          <div className="replay-line" role="group" aria-label="Your line">
            <span className="replay-line-text" title={`Your line from turn ${branch.turn} · ${branch.moves} ${branch.moves === 1 ? "move" : "moves"}`}>
              <strong>Your line</strong>
              <span>
                {compact ? `T${branch.turn}` : `turn ${branch.turn}`} · {branch.moves} {branch.moves === 1 ? "move" : "moves"}
              </span>
            </span>
            <button type="button" className="replay-line-btn" aria-label="Undo move" onClick={actions.undoMove}>
              <span className="replay-seg-long">Undo move</span>
              <span className="replay-seg-short" aria-hidden>
                Undo
              </span>
            </button>
            <button type="button" className="replay-line-btn replay-line-back" aria-label="Back to game" onClick={actions.backToGame}>
              <span className="replay-seg-long">Back to game</span>
              <span className="replay-seg-short" aria-hidden>
                Back
              </span>
            </button>
          </div>
        ) : (
          <div className="replay-seg" role="group" aria-label="What to show">
            <button type="button" className="replay-seg-btn" aria-pressed={!revealAll} aria-label="What I saw" title={`Only what ${youName} could see`} onClick={() => actions.setRevealAll(false)}>
              <span className="replay-seg-long">What I saw</span>
              <span className="replay-seg-short" aria-hidden>
                I saw
              </span>
            </button>
            <button type="button" className="replay-seg-btn" aria-pressed={revealAll} aria-label="Reveal all" title="Both hands, and every draw by name" onClick={() => actions.setRevealAll(true)}>
              <span className="replay-seg-long">Reveal all</span>
              <span className="replay-seg-short" aria-hidden>
                All
              </span>
            </button>
          </div>
        )}
        {compact ? reviewButton : null}
        {compact ? (
          <button
            type="button"
            className="replay-btn replay-more"
            aria-label="More replay options"
            aria-expanded={moreOpen}
            aria-controls="replay-more-sheet"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Icon>
              <path d="M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </Icon>
          </button>
        ) : null}
      </div>

      {showReview && reviewOpen && !compact ? (
        <ReviewPanel anchorRef={rootRef} render={summary} />
      ) : null}

      {showReview && reviewOpen && compact ? (
        <Dialog open onClose={() => setReviewOpen(false)} className="replay-more-backdrop" panelClassName="replay-review-sheet" label="Game review">
          {summary()}
        </Dialog>
      ) : null}

      {compact && moreOpen ? (
        <Dialog
          open
          onClose={() => setMoreOpen(false)}
          className="replay-more-backdrop"
          panelClassName="replay-more-sheet"
          label="More replay options"
          panelProps={{ id: "replay-more-sheet" }}
        >
          {turnSelect}
          {speedSelect}
          {showReview ? (
            // Short landscape has no room beside the mode toggle, so Review lives here (hidden by CSS elsewhere).
            <button
              type="button"
              className="replay-seg-btn replay-more-review"
              onClick={() => {
                setMoreOpen(false);
                setReviewOpen(true);
              }}
            >
              Game review
            </button>
          ) : null}
          <button type="button" className="replay-seg-btn replay-more-done" onClick={() => setMoreOpen(false)}>
            Done
          </button>
        </Dialog>
      ) : null}
    </div>
  );
}
