import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../../cards/atlas";
import type { Intent, PendingChoiceView, Seat } from "../../net/protocol";
import type { Box } from "../combat/battleArc";
import { CardTile } from "../zones/CardTile";
import { confirmQuestion } from "../hand/handPrompt";
import { clampHeldBottom, heldCardSpot } from "../hand/heldCardSpot";
import { usePopupScale } from "../preview/PopupSizeButtons";
import { useConfirmKeys } from "../input/useBoardHotkeys";

const EDGE = 8;

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
  const scale = usePopupScale();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [viewportH, setViewportH] = useState(() => (typeof window === "undefined" ? 0 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    const bubble = ref.current?.querySelector<HTMLElement>(".hand-confirm-bubble");
    setWidth(Math.max(ref.current?.offsetWidth ?? 0, (bubble?.offsetWidth ?? 0) * scale));
    setHeight((ref.current?.offsetHeight ?? 0) + (bubble?.offsetHeight ?? 0) * (scale - 1));
  }, [choice.id, scale]);
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
  const headerEl = [...document.querySelectorAll<HTMLElement>(".hand-rail-head, .hand-dock-head, .hand-fan-head")].find(
    (el) => el.offsetWidth > 0,
  );
  const spot = heldCardSpot(anchor, headerEl ? headerEl.getBoundingClientRect() : null);
  const style: CSSProperties = {
    left,
    top: clampHeldBottom(spot.bottom, spot.lift, height, viewportH, EDGE),
    ["--hold-gap" as string]: `${spot.gap}px`,
    ["--card-lift" as string]: `${spot.lift}px`,
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
