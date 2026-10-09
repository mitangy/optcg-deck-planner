import { useEffect, useState, type ReactNode } from "react";
import { DESKTOP_BOARD_QUERY, useMediaQuery } from "../board/useMediaQuery";
import { isTyping } from "../board/useBoardHotkeys";
import { PLAY_SPEEDS, type PlaySpeed } from "./replayCursor";
import type { ReplayControlsActions, ReplayControlsState } from "./useReplay";
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
  flip: (
    <Icon>
      <path d="M7 3 3 7h3v7h2V7h3zM17 21l4-4h-3v-7h-2v7h-3z" />
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

export function ReplayControls({ state, actions }: { state: ReplayControlsState; actions: ReplayControlsActions }) {
  const { step, total, turn, turns, playing, speed, revealAll, yourSeat, cameraSeat, playerNames } = state;
  // Desktop has room for every control; phones keep the transport, scrubber and mode toggle, and tuck the rest behind More.
  const compact = !useMediaQuery(DESKTOP_BOARD_QUERY);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        return;
      }
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

  const otherSide = playerNames[(1 - cameraSeat) as 0 | 1] || "the other player";
  const youName = playerNames[yourSeat] || "You";

  const turnSelect = (
    <label className="replay-field">
      <span className="replay-field-label">Turn</span>
      <select className="replay-select" value={turn} onChange={(e) => actions.goTurn(Number(e.target.value))} aria-label="Jump to turn">
        {turns.map((t) => (
          <option key={t.turn} value={t.turn}>
            {t.turn}
          </option>
        ))}
      </select>
    </label>
  );
  const speedSelect = (
    <label className="replay-field">
      <span className="replay-field-label">Speed</span>
      <select className="replay-select" value={speed} onChange={(e) => actions.setSpeed(Number(e.target.value) as PlaySpeed)} aria-label="Playback speed">
        {PLAY_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </label>
  );
  const flipButton = (
    <button
      type="button"
      className="replay-btn replay-flip"
      aria-label={`Flip the board to ${otherSide}'s side`}
      title={`Flip the board to ${otherSide}'s side`}
      onClick={actions.flip}
    >
      {ICONS.flip}
    </button>
  );

  return (
    <div className={`replay-controls${compact ? " replay-compact" : ""}`} role="group" aria-label="Replay controls">
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
        <span className="replay-readout" aria-hidden>
          {compact ? `T${turn} · ` : ""}
          {step}/{total}
        </span>
      </div>

      {compact ? null : (
        <div className="replay-row replay-pick">
          {turnSelect}
          {speedSelect}
          {flipButton}
        </div>
      )}

      <div className="replay-row">
        <div className="replay-seg" role="group" aria-label="What to show">
          <button type="button" className="replay-seg-btn" aria-pressed={!revealAll} title={`Only what ${youName} could see`} onClick={() => actions.setRevealAll(false)}>
            What I saw
          </button>
          <button type="button" className="replay-seg-btn" aria-pressed={revealAll} title="Both hands, and every draw by name" onClick={() => actions.setRevealAll(true)}>
            Reveal all
          </button>
        </div>
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

      {compact && moreOpen ? (
        <>
          <div className="replay-more-backdrop" onClick={() => setMoreOpen(false)} aria-hidden />
          <div id="replay-more-sheet" className="replay-more-sheet" role="dialog" aria-label="More replay options">
            {turnSelect}
            {speedSelect}
            {flipButton}
            <button type="button" className="replay-seg-btn replay-more-done" onClick={() => setMoreOpen(false)}>
              Done
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
