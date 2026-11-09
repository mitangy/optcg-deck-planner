import { useEffect, useRef, useState } from "react";
import type { DiceAction, DiceCall, DiceStateMessage, Seat } from "../../net/protocol";
import { motionReduced } from "../prompts/hideShrink";
import { diceSlot, diceStatus, type DiceView } from "./diceModel";
import { seatLabel } from "./playerNames";

/** How long the die tumbles after a roll arrives before its face and result are shown. */
export const DICE_TUMBLE_MS = 1000;

/** Which of the 3x3 grid cells hold a pip, per face. */
const PIPS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** A die face drawn with CSS pips; `face` null shows a blank die. */
export function DieFace({ face, tumbling }: { face: number | null; tumbling: boolean }) {
  const pips = face ? PIPS[face] : undefined;
  return (
    <div className={`dice-die${tumbling ? " is-tumbling" : ""}`} data-face={face ?? ""} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={pips?.includes(i) ? "dice-pip" : "dice-pip-gap"} />
      ))}
      {face === null ? <span className="dice-die-blank">?</span> : null}
    </div>
  );
}

/**
 * The face to draw and whether the die is still tumbling. A roll that arrives while this is mounted tumbles for
 * DICE_TUMBLE_MS (random faces, then the real one); a roll already there when it mounts (a reconnect) just shows.
 */
function useTumble(roll: number | null): { face: number | null; tumbling: boolean } {
  const first = useRef(roll);
  const [tumbling, setTumbling] = useState(false);
  const [shown, setShown] = useState<number>(1);
  useEffect(() => {
    if (roll === null || roll === first.current || motionReduced()) {
      setTumbling(false);
      return;
    }
    first.current = null;
    setTumbling(true);
    const spin = window.setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 90);
    const stop = window.setTimeout(() => setTumbling(false), DICE_TUMBLE_MS);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(stop);
    };
  }, [roll]);
  if (roll === null) return { face: null, tumbling: false };
  return { face: tumbling ? shown : roll, tumbling };
}

/** Whole seconds left until `deadline` (epoch ms), ticking while it is in the future. */
function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

const CALL_LABEL: Record<DiceCall, string> = { high: "High (4-6)", low: "Low (1-3)" };

type Props = {
  state: DiceStateMessage;
  onAction: (action: DiceAction) => void;
};

/**
 * The opening dice roll of a room's first game (#1190), shown where "Waiting for opponent" was: one player rolls,
 * the other calls High or Low, and the winner picks first or second. Spectators see the same, read-only.
 * The card keeps its size and every control keeps its place from step to step; only the labels change.
 */
export function DicePhase({ state, onAction }: Props) {
  const spectating = state.role === "spectator";
  const me: Seat | null = spectating ? null : state.seat;
  const { face, tumbling } = useTumble(state.roll);
  const secondsLeft = useSecondsLeft(state.step === "done" || state.step === "cancelled" ? null : state.deadline);
  const nameOf = (seat: Seat) => (me === seat ? "You" : seatLabel(state.players, seat));
  const view: DiceView = { ...state, me, tumbling };
  const slot = diceSlot(view, nameOf);

  return (
    <section className="dice-phase" aria-label="Dice roll for turn order" data-step={state.step}>
      <h2 className="dice-title">Who goes first?</h2>
      <div className="dice-seats">
        <div className={`dice-seat${me === state.roller ? " is-you" : ""}`}>
          <span className="dice-seat-name">{nameOf(state.roller)}</span>
          <span className="dice-seat-role">rolls</span>
        </div>
        <div className={`dice-seat${me === state.caller ? " is-you" : ""}`}>
          <span className="dice-seat-name">{nameOf(state.caller)}</span>
          <span className="dice-seat-role">{state.call ? `called ${state.call === "high" ? "High" : "Low"}` : "calls"}</span>
        </div>
      </div>
      <DieFace face={face} tumbling={tumbling} />
      <p className="dice-status" role="status" aria-live="polite">
        {diceStatus(view, nameOf)}
      </p>
      <div className="dice-actions">
        {slot.kind === "wait" ? (
          <p className="dice-wait">{slot.text}</p>
        ) : slot.kind === "choose" ? (
          <>
            <button type="button" className="btn btn-primary" disabled={!slot.enabled} onClick={() => onAction({ action: "first" })}>
              Go first
            </button>
            <button type="button" className="btn btn-secondary" disabled={!slot.enabled} onClick={() => onAction({ action: "second" })}>
              Go second
            </button>
          </>
        ) : slot.kind === "roll" ? (
          <button type="button" className="btn btn-primary dice-roll-btn" disabled={!slot.enabled} onClick={() => onAction({ action: "roll" })}>
            Roll
          </button>
        ) : (
          (["high", "low"] as const).map((call) => (
            <button
              key={call}
              type="button"
              className={`btn ${call === "high" ? "btn-primary" : "btn-secondary"}${slot.picked === call ? " is-picked" : ""}`}
              disabled={!slot.enabled}
              aria-pressed={slot.picked === call}
              onClick={() => onAction({ action: "call", call })}
            >
              {CALL_LABEL[call]}
            </button>
          ))
        )}
      </div>
      <p className="dice-timer" aria-hidden={secondsLeft === null}>
        {secondsLeft === null ? "" : `${secondsLeft}s left`}
      </p>
    </section>
  );
}
