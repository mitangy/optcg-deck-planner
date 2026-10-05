import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, Seat } from "../net/protocol";
import type { Box } from "./battleArc";
import { CardTile } from "./CardTile";
import { confirmQuestion } from "./handPrompt";
import { heldCardSpot } from "./heldCardSpot";
import { useConfirmKeys } from "./useBoardHotkeys";

const EDGE = 8;

/**
 * Yes/No for a card you just used from your hand ("Then, you may rest 1 DON!!…"),
 * shown on that card where it sat in the hand instead of a centred pop-up. The
 * card stays raised in its old spot, with the question just above it. Fixed
 * overlay (portal), clamped to the viewport; never shifts the hand or board.
 */
export function HandConfirmPrompt({
  choice,
  anchor,
  mySeat,
  onSend,
}: {
  choice: PendingChoiceView;
  anchor: Box;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(ref.current?.offsetWidth ?? 0);
  }, [choice.id]);
  useEffect(() => {
    yesRef.current?.focus({ preventScroll: true });
  }, [choice.id]);
  useConfirmKeys(true, choice.optional, (accept) => onSend({ type: "resolve_pending_choice", accept }));
  if (typeof document === "undefined") return null;

  const name = lookupCard(choice.cardDefId).name;
  const question = confirmQuestion(choice.prompt);
  const vw = window.innerWidth;
  const half = width / 2;
  const cx = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(cx, EDGE + half), Math.max(EDGE + half, vw - EDGE - half));
  // The hand's header row (Hand / Sort / Hide) stays uncovered: see heldCardSpot.
  const headerEl = [...document.querySelectorAll<HTMLElement>(".hand-rail-head, .hand-dock-head, .hand-fan-head")].find(
    (el) => el.offsetWidth > 0,
  );
  const spot = heldCardSpot(anchor, headerEl ? headerEl.getBoundingClientRect() : null);
  const style: CSSProperties = {
    left,
    top: spot.bottom,
    ["--hold-gap" as string]: `${spot.gap}px`,
    ["--card-lift" as string]: `${spot.lift}px`,
    // The card's centre stays over its old hand slot even when the bubble is clamped.
    ["--card-shift" as string]: `${cx - left}px`,
  };

  return createPortal(
    <div
      ref={ref}
      className="hand-confirm"
      role="dialog"
      aria-label={`${name}: ${question}`}
      style={style}
    >
      <div className="hand-confirm-bubble">
        <p className="hand-confirm-question">
          <strong>{name}</strong>
          <span>{question}</span>
        </p>
        <div className="hand-confirm-actions">
          <button
            ref={yesRef}
            type="button"
            className="btn btn-primary"
            aria-keyshortcuts="Y Space"
            onClick={() => onSend({ type: "resolve_pending_choice", accept: true })}
          >
            Yes
          </button>
          {choice.optional ? (
            <button
              type="button"
              className="btn btn-secondary"
              aria-keyshortcuts="N"
              onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}
            >
              No
            </button>
          ) : null}
        </div>
      </div>
      <div className="hand-confirm-card">
        <CardTile
          defId={choice.cardDefId}
          compact
          inspectGestures
          ownerSeat={mySeat}
          viewingSeat={mySeat}
          style={{ width: anchor.width, height: anchor.height }}
        />
      </div>
    </div>,
    document.body,
  );
}
