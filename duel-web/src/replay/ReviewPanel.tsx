/** The desktop Game review as a floating panel (#986): drag it by its header, resize it from its edges, and it stays where it was left. */
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  clampRect,
  defaultRect,
  keyMove,
  keyResize,
  moveRect,
  PANEL_MAX_W,
  PANEL_MIN,
  readRect,
  resizeRect,
  writeRect,
  type Edge,
  type Limits,
  type Rect,
} from "./floatRect";

const EDGES: Edge[] = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];
/** The size it opens at until the viewer changes it. */
const IDEAL = { w: 360, h: 560 };
const EDGE_LABEL: Record<Edge, string> = {
  top: "Resize the review panel taller or shorter from the top. Use the up and down arrow keys, or double-click to reset.",
  bottom: "Resize the review panel taller or shorter from the bottom. Use the up and down arrow keys, or double-click to reset.",
  left: "Resize the review panel wider or narrower from the left. Use the left and right arrow keys, or double-click to reset.",
  right: "Resize the review panel wider or narrower from the right. Use the left and right arrow keys, or double-click to reset.",
  "top-left": "",
  "top-right": "",
  "bottom-left": "",
  "bottom-right": "",
};

type Measure = { limits: Limits; anchor: { top: number; left: number; right: number } };

/** The window, the bottom edge of the top bar and the replay controls the panel opens above. */
function measure(anchor: RefObject<HTMLElement | null>): Measure {
  const bar = document.querySelector(".hud-bar")?.getBoundingClientRect().bottom ?? 0;
  const a = anchor.current?.getBoundingClientRect();
  const vp = { w: window.innerWidth, h: window.innerHeight };
  return { limits: { vp, top: bar > 0 ? bar + 8 : 0 }, anchor: a ? { top: a.top, left: a.left, right: a.right } : { top: vp.h, left: vp.w - 300, right: vp.w - 12 } };
}

export function ReviewPanel({
  anchorRef,
  panelRef,
  render,
}: {
  /** The replay controls: the panel opens above them, right-aligned. */
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** The content, given the keyboard grip for the header. */
  render(grip: ReactNode): ReactNode;
}) {
  const [stored, setStored] = useState<Rect | null>(() => readRect());
  const [live, setLive] = useState<Rect | null>(null);
  const [m, setM] = useState<Measure>(() => measure(anchorRef));
  const drag = useRef<{ kind: "move" | Edge; x: number; y: number; start: Rect } | null>(null);
  // Clamped when drawn, never in storage: a window that grows again gives the remembered box back.
  const rect = clampRect(live ?? stored ?? defaultRect(m.anchor, IDEAL, m.limits), m.limits);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const limitsRef = useRef(m.limits);
  limitsRef.current = m.limits;

  useEffect(() => {
    const on = () => setM(measure(anchorRef));
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [anchorRef]);

  const commit = useCallback((next: Rect | null) => {
    setStored(next);
    writeRect(next);
  }, []);

  const begin = (e: PointerEvent<HTMLDivElement>, kind: "move" | Edge) => {
    e.preventDefault();
    // Captured on the element under the pointer (a click that follows still lands on the header or handle, for the double-click reset).
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: rectRef.current };
  };
  const next = (e: PointerEvent<HTMLDivElement>): Rect => {
    const d = drag.current!;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    return d.kind === "move" ? moveRect(d.start, dx, dy, limitsRef.current) : resizeRect(d.start, d.kind, dx, dy, limitsRef.current);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const edge = target.closest<HTMLElement>("[data-edge]")?.dataset.edge as Edge | undefined;
    if (edge) return begin(e, edge);
    // The header is the grip; its buttons still click.
    if (target.closest(".rv-summary-head") && !target.closest("button")) begin(e, "move");
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setLive(next(e));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const done = e.type === "pointercancel" ? null : next(e);
    drag.current = null;
    setLive(null);
    if (done) commit(done);
  };
  const reset = (e: { target: EventTarget }) => {
    const t = e.target as Element;
    if (t.closest("[data-edge]") || (t.closest(".rv-summary-head") && !t.closest("button"))) commit(null);
  };
  const onGripKey = (e: KeyboardEvent<HTMLElement>) => {
    const r = keyMove(rectRef.current, e.key, e.shiftKey, limitsRef.current);
    if (!r) return;
    e.preventDefault();
    commit(r);
  };
  const onEdgeKey = (e: KeyboardEvent<HTMLElement>, edge: Edge) => {
    const r = keyResize(rectRef.current, edge, e.key, e.shiftKey, limitsRef.current);
    if (!r) return;
    e.preventDefault();
    commit(r);
  };

  const grip = (
    <button type="button" className="rv-grip" aria-label="Move the review panel. Drag the header, or use the arrow keys here." title="Drag the header to move; double-click it to put the panel back" onKeyDown={onGripKey}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden focusable="false">
        <path d="M9 5a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 9 5zm6 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 15 5zM9 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm6 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM9 15.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm6 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z" />
      </svg>
    </button>
  );
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
  // In the page's body, not the dock: the dock is its own stacking layer, under the End turn button.
  return createPortal(
    <div
      className={`replay-review-pop${live ? " is-dragging" : ""}`}
      role="dialog"
      aria-label="Game review"
      ref={panelRef}
      style={style}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={reset}
    >
      <div className="rv-pop-scroll">{render(grip)}</div>
      {EDGES.map((edge) => {
        const side = edge === "top" || edge === "bottom" || edge === "left" || edge === "right";
        const vertical = edge === "top" || edge === "bottom";
        return (
          <div
            key={edge}
            data-edge={edge}
            className={`rv-resize rv-resize-${edge}`}
            role={side ? "separator" : undefined}
            aria-orientation={side ? (vertical ? "horizontal" : "vertical") : undefined}
            aria-label={side ? EDGE_LABEL[edge] : undefined}
            aria-hidden={side ? undefined : true}
            aria-valuenow={side ? (vertical ? rect.h : rect.w) : undefined}
            aria-valuemin={side ? (vertical ? PANEL_MIN.h : PANEL_MIN.w) : undefined}
            aria-valuemax={side ? (vertical ? m.limits.vp.h : Math.min(PANEL_MAX_W, m.limits.vp.w)) : undefined}
            tabIndex={side ? 0 : undefined}
            onKeyDown={side ? (e) => onEdgeKey(e, edge) : undefined}
          />
        );
      })}
    </div>,
    document.body,
  );
}
