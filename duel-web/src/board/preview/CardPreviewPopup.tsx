import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { lookupCard } from "../../cards/atlas";
import { updateSettings, useDuelSettings } from "../../settings";
import { applyPopupSize } from "./popupSize";
import { PopupSizeButtons } from "./PopupSizeButtons";
import { CardPreviewContent } from "./CardPreviewPanel";
import { POPUP_LEAVE_MS, clearPreviewCard, getHoverAnchor, previewPopupLive, usePreviewCard, usePreviewHovering } from "./cardPreview";
import {
  clampPreviewPopupPos,
  placePreviewPopup,
  parsePreviewPopupPos,
  serializePreviewPopupPos,
  type PopupPos,
} from "./previewPopupPos";

export function CardPreviewPopup() {
  const preview = usePreviewCard();
  const settings = useDuelSettings();
  const saved = parsePreviewPopupPos(settings.previewPopupPos);
  const pinned = settings.previewPopupPinned;
  const hovering = usePreviewHovering();
  const [overPopup, setOverPopup] = useState(false);
  const [drag, setDrag] = useState<PopupPos | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pos = drag ?? saved;
  const live = previewPopupLive({ pinned, hovering, overPopup, dragging: drag != null });
  // Stays true after `live` ends, so the pointer can cross a gap onto the pop-up.
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

  useLayoutEffect(() => {
    applyPopupSize(settings.previewPopupSize, document.documentElement, "previewPopupSize");
    const fit = () => {
      const box = boxRef.current;
      if (!box) return;
      const view = { width: window.innerWidth, height: window.innerHeight };
      if (overPopup && !drag && box.dataset.dodged) {
        const r = box.getBoundingClientRect();
        const at = clampPreviewPopupPos({ x: r.left, y: r.top }, r, view);
        box.style.left = `${at.x}px`;
        box.style.top = `${at.y}px`;
        return;
      }
      if (!pos && box.dataset.dodged) {
        box.style.removeProperty("left");
        box.style.removeProperty("top");
        box.style.removeProperty("right");
      }
      delete box.dataset.dodged;
      const r = box.getBoundingClientRect();
      const base = pos ? clampPreviewPopupPos(pos, r, view) : { x: r.left, y: r.top };
      if (pos) {
        box.style.left = `${base.x}px`;
        box.style.top = `${base.y}px`;
      }
      const adjust = !(pinned || drag || overPopup);
      const anchor = adjust ? getHoverAnchor() : null;
      // A spot you dragged it to is yours; only the default spot steps off the dock.
      const dock = adjust && !pos
        ? Array.from(document.querySelectorAll<HTMLElement>(".board-root .primary-dock")).map((el) => el.getBoundingClientRect())
        : [];
      const at = anchor || dock.length > 0 ? placePreviewPopup(base, r, anchor, view, dock) : base;
      if (at === base) return;
      box.style.left = `${at.x}px`;
      box.style.top = `${at.y}px`;
      box.style.right = "auto";
      box.dataset.dodged = "1";
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

  const style: CSSProperties | undefined = pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined;
  return (
    <div
      ref={boxRef}
      className={`card-preview-popup${settings.previewBigCard ? " card-preview-popup-big" : ""}${pos ? " card-preview-popup-placed" : ""}${drag ? " is-dragging" : ""}`}
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
        <PopupSizeButtons className="card-preview-popup-size" what="card preview" setting="previewPopupSize" />
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
