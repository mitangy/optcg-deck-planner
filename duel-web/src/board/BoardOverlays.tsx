import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import { CardArt } from "../cards/CardArt";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import { fallbackToDefaultDon, useDonArt } from "./don/donArt";
import { attachLabel, quickAttachLabel, type PendingAttach } from "./don/donSelection";
import { popoverPlacement, type CardActionText, type PopoverSize } from "./input/cardActions";
import { usePopupScale } from "./preview/PopupSizeButtons";
import { useTrackedBoxes } from "./layout/useTrackedBoxes";

const CONFIRM_W = 250;
const EDGE = 8;

function useMeasuredSize(ref: { current: HTMLElement | null }, key: string, scale = 1): PopoverSize {
  const [size, setSize] = useState<PopoverSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = { width: el.offsetWidth * scale, height: Math.max(el.offsetHeight, el.scrollHeight) * scale };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, key, scale]);
  return size;
}

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
  const ref = useRef<HTMLDivElement | null>(null);
  const scale = usePopupScale();
  const size = useMeasuredSize(ref, box == null ? "none" : "box", scale);

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, [pending.targetId]);

  if (typeof document === "undefined") return null;
  const vw = window.innerWidth;
  // Before the first measure, assume 250px (CSS sizes the confirm with its font).
  const width = size.width || Math.min(CONFIRM_W * scale, vw - EDGE * 2);
  let style: CSSProperties;
  if (box) {
    const place = popoverPlacement(box, { width, height: size.height }, { width: vw, height: window.innerHeight }, EDGE, -8);
    style = {
      left: place.left,
      top: place.top,
      transform: place.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
    };
  } else {
    style = { left: "50%", bottom: "30%", transform: "translate(-50%, 0)" };
  }

  return createPortal(
    <div
      ref={ref}
      className="don-attach-confirm"
      role="dialog"
      aria-label={`${attachLabel(pending.donIds.length)} to ${targetName}`}
      style={style}
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
  keyNum?: number | null;
  keyLetter?: string | null;
  keyTag?: string;
  onPress: () => void;
};

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
  const shape = `${actions.map((a) => a.id).join("|")}/${donCounts.join(",")}`;
  const scale = usePopupScale();
  const size = useMeasuredSize(ref, `${shape}/${box == null}`, scale);
  if (!box || typeof document === "undefined") return null;
  const place = popoverPlacement(box, size, { width: window.innerWidth, height: window.innerHeight });

  const style: CSSProperties = {
    left: place.left,
    top: place.top,
    transform: place.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };
  if (size.height > window.innerHeight - EDGE * 2) {
    style.maxHeight = (window.innerHeight - EDGE * 2) / scale;
    style.overflowY = "auto";
  }
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
  | { type: "play_card" | "counter"; defId: string; artCopy?: number; ownerSeat?: Seat };

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
      : resolveCardImageUrl(payload.defId, { ownerSeat: payload.ownerSeat, artCopy: payload.artCopy, size: "thumb" });
  const label = payload.type === "give_don" ? "DON!!" : lookupCard(payload.defId).name;

  return createPortal(
    <div
      className={`drag-ghost drag-ghost-${payload.type}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      aria-hidden
    >
      {payload.type === "give_don" ? (
        src ? <img src={src} alt="" draggable={false} /> : <span>{label}</span>
      ) : (
        <CardArt src={src} defId={payload.defId} fallback={<span>{label}</span>} draggable={false} />
      )}
      {payload.type === "give_don" && payload.count > 1 ? (
        <span className="drag-ghost-count">×{payload.count}</span>
      ) : null}
    </div>,
    document.body,
  );
}
