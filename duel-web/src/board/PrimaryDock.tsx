import { useEffect, useState } from "react";
import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import { ConfirmButton } from "./ConfirmButton";
import { dockAnchor, sameAnchor, type DockAnchor } from "./dockAnchor";
import type { WaitingOnOpponent } from "./waitingOnOpponent";

export function intentBtnClass(intent: Intent): string {
  if (intent.type === "end_turn") return "intent-btn intent-btn-end";
  if (intent.type === "pass_counter" || intent.type === "pass_block") {
    return "intent-btn intent-btn-pass";
  }
  if (intent.type !== "mulligan") return "intent-btn";
  return intent.doMulligan ? "intent-btn intent-btn-mulligan" : "intent-btn intent-btn-keep";
}

type ButtonProps = {
  primary: Intent;
  view?: PlayerView;
  disabled?: boolean;
  /** End turn needs a second tap (gameplay setting); `reason` fills the armed label. */
  confirmEndTurn?: { reason: string | null } | null;
  /** The defend tray relabels the primary and may replace sending it. */
  defend?: { label: string; onPress?: () => void; warn?: boolean };
  /** Relabels a Pass counter primary ("Resolve" once the defender is safe). */
  counterLabel?: string;
  onSend: (intent: Intent) => void;
};

/** The one "advance the game" button, shared by the rail bar and the board dock. */
export function PrimaryActionButton({
  primary,
  view,
  disabled,
  confirmEndTurn = null,
  defend,
  counterLabel,
  onSend,
}: ButtonProps) {
  if (primary.type === "end_turn" && confirmEndTurn) {
    return (
      <ConfirmButton
        className={`${intentBtnClass(primary)} intent-btn-primary`}
        label={intentLabel(primary, view)}
        confirmLabel={
          confirmEndTurn.reason ? (
            <>
              <span className="end-warn-full">End turn? {confirmEndTurn.reason}</span>
              <span className="end-warn-short">Tap again to end</span>
            </>
          ) : (
            "Tap again to end"
          )
        }
        title={
          confirmEndTurn.reason
            ? `${confirmEndTurn.reason}. Tap again to end your turn.`
            : "Ends your turn after a second tap"
        }
        disabled={disabled}
        reserveWidth
        onConfirm={() => onSend(primary)}
      />
    );
  }
  return (
    <button
      type="button"
      className={`${intentBtnClass(primary)} intent-btn-primary${defend?.warn ? " intent-btn-warn" : ""}`}
      disabled={disabled}
      onClick={() => (defend?.onPress ? defend.onPress() : onSend(primary))}
    >
      {defend
        ? defend.label
        : primary.type === "pass_counter" && counterLabel
          ? counterLabel
          : intentLabel(primary, view)}
    </button>
  );
}

/**
 * "Waiting for opponent": the same slot and size as the primary button, so the
 * eye is already there. Pulses while a real answer is awaited.
 */
export function WaitingIndicator({ waiting }: { waiting: WaitingOnOpponent }) {
  return (
    <div
      className={`waiting-opp waiting-opp-${waiting.kind}${waiting.urgent ? " is-urgent" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="waiting-opp-dot" aria-hidden />
      <span className="waiting-opp-text">
        <strong>{waiting.title}</strong>
        <span>{waiting.detail}{waiting.urgent ? "…" : ""}</span>
      </span>
    </div>
  );
}

/** Tracks the board's midline strip (rAF, state only on change): follows resizes, zoom and tilt. */
function useDockAnchor(enabled: boolean): DockAnchor | null {
  const [anchor, setAnchor] = useState<DockAnchor | null>(null);
  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return;
    }
    let raf = 0;
    let last: DockAnchor | null = null;
    const tick = () => {
      const rect = (sel: string) =>
        document.querySelector<HTMLElement>(`.board-root ${sel}`)?.getBoundingClientRect() ?? null;
      const next = dockAnchor(rect(".midline"), [rect(".side-you"), rect(".playmat")]);
      if (!sameAnchor(next, last)) {
        last = next;
        setAnchor(next);
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [enabled]);
  return anchor;
}

type DockProps = Omit<ButtonProps, "primary"> & {
  primary: Intent | null;
  waiting: WaitingOnOpponent | null;
};

/**
 * Desktop: the primary action (or the wait for the opponent) floats at the
 * right end of the board's midline instead of sitting in the side rail. Fixed
 * position, so showing, hiding or relabelling it never moves anything.
 */
export function PrimaryDock({ primary, waiting, ...button }: DockProps) {
  const show = primary != null || waiting != null;
  const anchor = useDockAnchor(show);
  if (!show || !anchor) return null;
  return (
    <div
      className={`primary-dock${primary ? " has-primary" : ""}`}
      style={{ left: anchor.x, top: anchor.y }}
    >
      {primary ? (
        <PrimaryActionButton primary={primary} {...button} />
      ) : waiting ? (
        <WaitingIndicator waiting={waiting} />
      ) : null}
    </div>
  );
}
