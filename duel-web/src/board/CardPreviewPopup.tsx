import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { lookupCard } from "../cards/atlas";
import { updateSettings, useDuelSettings } from "../settings";
import { CardPreviewContent } from "./CardPreviewPanel";
import { POPUP_LEAVE_MS, clearPreviewCard, previewPopupLive, usePreviewCard, usePreviewHovering } from "./cardPreview";
import {
  clampPreviewPopupPos,
  parsePreviewPopupPos,
  serializePreviewPopupPos,
  type PopupPos,
} from "./previewPopupPos";

/**
 * Desktop: the hovered card as a large floating pop-up (#529) instead of the
 * side-column panel. It is a hover pop-up: up while the mouse is on a card that
 * sets the preview, a moment after it leaves (so the pointer can cross onto the
 * pop-up, which then stays while it is on it), and while its header is dragged.
 * Pinned (`previewPopupPinned`) it stays up on the last card like the old panel,
 * with a × that unpins and hides it; auto previews only show while pinned. The
 * header drags it anywhere on screen (saved as `previewPopupPos`, double-click
 * puts it back at the top right). Fixed, so it never shifts the board.
 */
export function CardPreviewPopup() {
  const preview = usePreviewCard();
  const settings = useDuelSettings();
  const saved = parsePreviewPopupPos(settings.previewPopupPos);
  const pinned = settings.previewPopupPinned;
  const hovering = usePreviewHovering();
  const [overPopup, setOverPopup] = useState(false);
  /** Where the pop-up is while the header is being dragged. */
  const [drag, setDrag] = useState<PopupPos | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pos = drag ?? saved;
  const live = previewPopupLive({ pinned, hovering, overPopup, dragging: drag != null });
  /** Stays true POPUP_LEAVE_MS after `live` ends, so the pointer can cross a gap onto the pop-up. */
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (live) {
      setLingering(true);
      return;
    }
    const t = window.setTimeout(() => setLingering(false), POPUP_LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [live]);
  const shown = preview != null && (live || lingering);

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

  if (!preview || !shown) return null;

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
      // The box moved with the pointer, which may fire no enter event; it is still over it unless the clamp held it back.
      const at = moved ?? from;
      setOverPopup(
        ev.clientX >= at.x && ev.clientX <= at.x + from.width && ev.clientY >= at.y && ev.clientY <= at.y + from.height,
      );
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
      onPointerEnter={() => setOverPopup(true)}
      onPointerLeave={() => setOverPopup(false)}
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
        <button
          type="button"
          className={`card-preview-popup-pin${pinned ? " is-pinned" : ""}`}
          aria-label={pinned ? "Unpin card preview" : "Pin card preview"}
          aria-pressed={pinned}
          title={pinned ? "Unpin" : "Pin: keep it open"}
          onClick={() => updateSettings({ previewPopupPinned: !pinned })}
        >
          {"\u{1F4CC}"}
        </button>
        {pinned ? (
          <button
            type="button"
            className="card-preview-popup-close"
            aria-label="Close card preview"
            onClick={() => {
              updateSettings({ previewPopupPinned: false });
              setOverPopup(false);
              clearPreviewCard();
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      <CardPreviewContent preview={preview} popup />
    </div>
  );
}
