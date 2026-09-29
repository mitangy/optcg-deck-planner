import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

const DEFAULT_THRESHOLD_PX = 8;

/** Axis the nearest scroll container pans on (only touch / pen care). */
export type PanAxis = "x" | "y" | "none";

export type DragDecision = "wait" | "start" | "cancel";

/**
 * Decide whether a pointer movement should begin a drag.
 *
 * A mouse never pans a scroll container by dragging, so any movement past the
 * threshold starts a drag in any direction (on desktop the hand lives in a
 * right-hand rail, so a drag to the board is mostly horizontal — the old
 * "horizontal means scroll" rule silently cancelled every desktop drag).
 * Touch / pen yield the gesture to native scrolling when it runs along the
 * scroll container's pan axis.
 */
export function decideDragStart(opts: {
  dx: number;
  dy: number;
  pointerType: string;
  panAxis: PanAxis;
  thresholdPx?: number;
}): DragDecision {
  const threshold = opts.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const { dx, dy } = opts;
  if (Math.hypot(dx, dy) < threshold) return "wait";
  if (opts.pointerType === "mouse") return "start";
  if (opts.panAxis === "x" && Math.abs(dx) > Math.abs(dy)) return "cancel";
  if (opts.panAxis === "y" && Math.abs(dy) > Math.abs(dx)) return "cancel";
  return "start";
}

/** Nearest ancestor that actually scrolls (content overflows) → its pan axis. */
export function detectPanAxis(el: Element | null): PanAxis {
  if (typeof window === "undefined" || !el) return "none";
  let node = el.parentElement;
  while (node && node !== document.body) {
    const cs = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 1) {
      return "x";
    }
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return "y";
    }
    node = node.parentElement;
  }
  return "none";
}

type Options<T> = {
  /** When false, pointer handlers are no-ops (clicks work normally). */
  enabled: boolean;
  payload: T;
  thresholdPx?: number;
  onDragStart?: (payload: T) => void;
  /** Called after threshold crossed. */
  onDragEnd?: (payload: T, clientX: number, clientY: number) => void;
  onDragCancel?: () => void;
};

/**
 * Pointer-based drag with a small movement threshold so clicks still work.
 * Keeps HTML5 `draggable` off — callers should leave `draggable={false}`.
 *
 * Works for mouse and touch. For touch / pen, pans along the nearest scroll
 * container's axis are left to native scrolling (see `decideDragStart`), and
 * pointer capture is delayed until the drag actually begins.
 */
export function usePointerDrag<T>({
  enabled,
  payload,
  thresholdPx = DEFAULT_THRESHOLD_PX,
  onDragStart,
  onDragEnd,
  onDragCancel,
}: Options<T>) {
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const startRef = useRef<{
    pointerId: number;
    pointerType: string;
    panAxis: PanAxis;
    x: number;
    y: number;
    armed: boolean;
    started: boolean;
  } | null>(null);

  const reset = useCallback(() => {
    startRef.current = null;
    setDragging(false);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      startRef.current = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        panAxis:
          e.pointerType === "mouse" ? "none" : detectPanAxis(e.currentTarget as Element),
        x: e.clientX,
        y: e.clientY,
        armed: true,
        started: false,
      };
      // Do not capture yet — capturing on down blocks parent overflow-x scroll.
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const s = startRef.current;
      if (!s?.armed || s.pointerId !== e.pointerId) return;
      if (!s.started) {
        const decision = decideDragStart({
          dx: e.clientX - s.x,
          dy: e.clientY - s.y,
          pointerType: s.pointerType,
          panAxis: s.panAxis,
          thresholdPx,
        });
        if (decision === "wait") return;
        if (decision === "cancel") {
          // Let the scroll container own this pan.
          s.armed = false;
          return;
        }
        s.started = true;
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        onDragStart?.(payload);
      }
    },
    [onDragStart, payload, thresholdPx],
  );

  const finish = useCallback(
    (e: ReactPointerEvent, cancelled: boolean) => {
      const s = startRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const started = s.started;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* already released */
      }
      reset();
      if (cancelled) {
        if (started) onDragCancel?.();
        return;
      }
      if (started) {
        suppressClickRef.current = true;
        onDragEnd?.(payload, e.clientX, e.clientY);
      }
    },
    [onDragCancel, onDragEnd, payload, reset],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => finish(e, false),
    [finish],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => finish(e, true),
    [finish],
  );

  /** Swallow the click that follows a completed drag (threshold crossed). */
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    dragging,
    bind: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel,
          onClickCapture,
          // pan-x lets the hand row scroll; switches to none once dragging.
          style: {
            touchAction: (dragging ? "none" : "pan-x") as "none" | "pan-x",
          },
        }
      : {},
  };
}
