import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import { boxCenter } from "./battleArc";
import { DON_CARD_ART } from "./donArt";
import { attachLabel, type PendingAttach } from "./donSelection";
import { useTrackedBoxes } from "./useTrackedBoxes";

const CONFIRM_W = 250;
const EDGE = 8;

/**
 * "Attach N DON!!" confirm, anchored to the tapped Leader / Character. Fixed
 * overlay (portal) so opening it never shifts the board; it follows the card
 * through resizes and flips below the card when there's no room above.
 */
export function DonAttachConfirm({
  pending,
  targetName,
  onConfirm,
  onCancel,
}: {
  pending: PendingAttach;
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const boxes = useTrackedBoxes([pending.targetId]);
  const box = boxes?.[0] ?? null;
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, [pending.targetId]);

  if (typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const half = Math.min(CONFIRM_W, vw - EDGE * 2) / 2;
  let style: CSSProperties;
  if (box) {
    const c = boxCenter(box);
    const x = Math.min(Math.max(c.x, EDGE + half), vw - EDGE - half);
    const above = box.top > 84;
    style = above
      ? { left: x, top: box.top - 8, transform: "translate(-50%, -100%)" }
      : { left: x, top: box.top + box.height + 8, transform: "translate(-50%, 0)" };
  } else {
    style = { left: "50%", bottom: "30%", transform: "translate(-50%, 0)" };
  }

  return createPortal(
    <div
      className="don-attach-confirm"
      role="dialog"
      aria-label={`${attachLabel(pending.donIds.length)} to ${targetName}`}
      style={{ ...style, width: half * 2 }}
    >
      <div className="don-attach-title">
        <img src={DON_CARD_ART} alt="" className="don-attach-icon" draggable={false} />
        <span>
          ×{pending.donIds.length} → <strong>{targetName}</strong>
        </span>
      </div>
      <div className="don-attach-actions">
        <button type="button" className="don-attach-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          className="don-attach-ok"
          onClick={onConfirm}
        >
          {attachLabel(pending.donIds.length)}
        </button>
      </div>
    </div>,
    document.body,
  );
}

const QUICK_EDGE = 8;

/**
 * "+1 / +2 / All" DON!! chips over the selected Leader / Character. Fixed
 * overlay (portal) that follows the card, above it when there is room and
 * below otherwise, and never leaves the viewport, so it cannot shift the board.
 */
export function DonQuickRow({
  targetId,
  targetName,
  counts,
  onPick,
}: {
  targetId: string;
  targetName: string;
  counts: number[];
  onPick: (count: number) => void;
}) {
  const boxes = useTrackedBoxes([targetId]);
  const box = boxes?.[0] ?? null;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    setWidth(rowRef.current?.offsetWidth ?? 0);
  }, [counts.length, box == null]);
  if (!box || typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const c = boxCenter(box);
  const half = width / 2;
  const x = Math.min(Math.max(c.x, QUICK_EDGE + half), vw - QUICK_EDGE - half);
  const above = box.top > 64;
  const style: CSSProperties = above
    ? { left: x, top: box.top - 6, transform: "translate(-50%, -100%)" }
    : { left: x, top: box.top + box.height + 6, transform: "translate(-50%, 0)" };
  return createPortal(
    <div
      ref={rowRef}
      className="don-quick"
      role="group"
      aria-label={`Give DON!! to ${targetName}`}
      style={style}
    >
      <img src={DON_CARD_ART} alt="" className="don-quick-icon" draggable={false} />
      {counts.map((n, i) => (
        <button
          key={n}
          type="button"
          className="don-quick-btn"
          aria-label={`Give ${n} DON!! to ${targetName}`}
          onClick={() => onPick(n)}
        >
          {i === counts.length - 1 && n > 2 ? `All (${n})` : `+${n}`}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export type GhostPayload =
  | { type: "give_don"; count: number }
  | { type: "play_card"; defId: string; ownerSeat?: Seat };

/**
 * Card that follows the pointer while a drag is in flight (mouse or touch),
 * so desktop users can see what they're carrying. pointer-events: none so
 * drop hit-testing (elementFromPoint) sees the board underneath.
 */
export function DragGhost({ payload }: { payload: GhostPayload | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const active = payload != null;

  useEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, [active]);

  if (!payload || !pos || typeof document === "undefined") return null;
  const src =
    payload.type === "give_don"
      ? DON_CARD_ART
      : resolveCardImageUrl(payload.defId, { ownerSeat: payload.ownerSeat, size: "thumb" });
  const label = payload.type === "play_card" ? lookupCard(payload.defId).name : "DON!!";

  return createPortal(
    <div
      className={`drag-ghost drag-ghost-${payload.type}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      aria-hidden
    >
      {src ? <img src={src} alt="" draggable={false} /> : <span>{label}</span>}
      {payload.type === "give_don" && payload.count > 1 ? (
        <span className="drag-ghost-count">×{payload.count}</span>
      ) : null}
    </div>,
    document.body,
  );
}
