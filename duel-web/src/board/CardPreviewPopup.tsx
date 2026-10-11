import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { lookupCard } from "../cards/atlas";
import { updateSettings, useDuelSettings } from "../settings";
import { CardPreviewContent } from "./CardPreviewPanel";
import { clearPreviewCard, usePreviewCard } from "./cardPreview";
import {
  clampPreviewPopupPos,
  parsePreviewPopupPos,
  serializePreviewPopupPos,
  type PopupPos,
} from "./previewPopupPos";

/**
 * Desktop: the hovered card as a large floating pop-up (#529) instead of the
 * side-column panel. Its header drags it anywhere on screen (saved as
 * `previewPopupPos`, double-click puts it back at the top right), the × closes
 * it until the next hover. Fixed, so it never shifts the board; only its own
 * box takes pointer events.
 */
export function CardPreviewPopup() {
  const preview = usePreviewCard();
  const saved = parsePreviewPopupPos(useDuelSettings().previewPopupPos);
  /** Where the pop-up is while the header is being dragged. */
  const [drag, setDrag] = useState<PopupPos | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pos = drag ?? saved;

  // A placed pop-up must never end up out of reach: keep it inside the window after
  // every render (a taller card) and when the window shrinks.
  useLayoutEffect(() => {
    const fit = () => {
      const box = boxRef.current;
      if (!box || !pos) return;
      const r = box.getBoundingClientRect();
      const at = clampPreviewPopupPos(pos, r, { width: window.innerWidth, height: window.innerHeight });
      box.style.left = `${at.x}px`;
      box.style.top = `${at.y}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });

  if (!preview) return null;

  const onHeadPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (e.button !== 0 || !box || (e.target as Element).closest("button")) return;
    const head = e.currentTarget;
    const from = box.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    let moved: PopupPos | null = null;
    e.preventDefault();
    head.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent | globalThis.PointerEvent) => {
      moved = clampPreviewPopupPos(
        { x: from.left + ev.clientX - start.x, y: from.top + ev.clientY - start.y },
        from,
        { width: window.innerWidth, height: window.innerHeight },
      );
      setDrag(moved);
    };
    const end = (ev: globalThis.PointerEvent) => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", end);
      head.removeEventListener("pointercancel", end);
      if (moved && ev.type === "pointerup") updateSettings({ previewPopupPos: serializePreviewPopupPos(moved) });
      setDrag(null);
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
  };

  const style: CSSProperties | undefined = pos ? { left: pos.x, top: pos.y, right: "auto", maxHeight: "calc(100dvh - 16px)" } : undefined;
  return (
    <div
      ref={boxRef}
      className={`card-preview-popup${drag ? " is-dragging" : ""}`}
      style={style}
      role="dialog"
      aria-label="Card preview"
    >
      <div
        className="card-preview-popup-head"
        onPointerDown={onHeadPointerDown}
        onDoubleClick={(e) => {
          if ((e.target as Element).closest("button")) return;
          if (saved) updateSettings({ previewPopupPos: "" });
        }}
        title="Drag to move, double-click to put back"
      >
        <span className="card-preview-popup-grip" aria-hidden>
          ⠿
        </span>
        <span className="card-preview-popup-title">{lookupCard(preview.defId).name}</span>
        <button type="button" className="card-preview-popup-close" aria-label="Close card preview" onClick={clearPreviewCard}>
          ×
        </button>
      </div>
      <CardPreviewContent preview={preview} popup />
    </div>
  );
}
