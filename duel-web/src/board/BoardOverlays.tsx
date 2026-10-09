import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import { boxCenter } from "./battleArc";
import { fallbackToDefaultDon, useDonArt } from "./donArt";
import { attachLabel, quickAttachLabel, type PendingAttach } from "./donSelection";
import { popoverPlacement, type CardActionText } from "./cardActions";
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
  const donArt = useDonArt();
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
        <img src={donArt()} alt="" className="don-attach-icon" draggable={false} onError={fallbackToDefaultDon} />
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

export type CardActionButton = {
  id: string;
  text: CardActionText;
  /** Hotkey badge data, as on the intent bar's buttons. */
  keyNum?: number | null;
  keyLetter?: string | null;
  keyTag?: string;
  onPress: () => void;
};

/**
 * The selected card's actions, as a small popover on the card itself ("Activate
 * Ability", "Counter +2000", Play, Attack...). With `donCounts` the +1 / +2 / All
 * DON!! chips sit in the same popover, so one card never gets two overlays.
 * Fixed overlay (portal) that follows the card, tucked over its top edge or
 * below it when there is no room, clamped to the viewport; never shifts layout.
 */
export function CardActionPopover({
  anchorId,
  cardName,
  actions,
  donCounts = [],
  onDon,
}: {
  anchorId: string;
  cardName: string;
  actions: CardActionButton[];
  donCounts?: number[];
  onDon?: (count: number) => void;
}) {
  const donArt = useDonArt();
  const boxes = useTrackedBoxes([anchorId]);
  const box = boxes?.[0] ?? null;
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const shape = `${actions.map((a) => a.id).join("|")}/${donCounts.join(",")}`;
  useLayoutEffect(() => {
    setWidth(ref.current?.offsetWidth ?? 0);
  }, [shape, box == null]);
  if (!box || typeof document === "undefined") return null;
  const place = popoverPlacement(box, width, window.innerWidth);
  const style: CSSProperties = {
    left: place.left,
    top: place.top,
    transform: place.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };
  return createPortal(
    <div
      ref={ref}
      className="card-actions"
      role="group"
      aria-label={`Actions for ${cardName}`}
      style={style}
    >
      {donCounts.length > 0 && onDon ? (
        <div className="card-actions-don" role="group" aria-label={`Give DON!! to ${cardName}`}>
          <img src={donArt()} alt="" className="don-quick-icon" draggable={false} onError={fallbackToDefaultDon} />
          {donCounts.map((n, i) => (
            <button
              key={n}
              type="button"
              className="don-quick-btn"
              aria-label={`${quickAttachLabel(n, donCounts)} to ${cardName}`}
              title={quickAttachLabel(n, donCounts)}
              onClick={() => onDon(n)}
            >
              {i === donCounts.length - 1 && n > 2 ? `All (${n})` : `+${n}`}
            </button>
          ))}
        </div>
      ) : null}
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className="card-action-btn"
          title={a.text.title}
          aria-label={a.text.title}
          data-key-num={a.keyNum ?? undefined}
          data-key-letter={a.keyLetter ?? undefined}
          data-key-tag={a.keyTag || undefined}
          onClick={a.onPress}
        >
          <span className="card-action-label">{a.text.label}</span>
          {a.text.sub ? <span className="card-action-sub">{a.text.sub}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export type GhostPayload =
  | { type: "give_don"; count: number }
  | { type: "play_card" | "counter"; defId: string; ownerSeat?: Seat };

/**
 * Card that follows the pointer while a drag is in flight (mouse or touch),
 * so desktop users can see what they're carrying. pointer-events: none so
 * drop hit-testing (elementFromPoint) sees the board underneath.
 */
export function DragGhost({ payload }: { payload: GhostPayload | null }) {
  const donArt = useDonArt();
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
      ? donArt()
      : resolveCardImageUrl(payload.defId, { ownerSeat: payload.ownerSeat, size: "thumb" });
  const label = payload.type === "give_don" ? "DON!!" : lookupCard(payload.defId).name;

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
