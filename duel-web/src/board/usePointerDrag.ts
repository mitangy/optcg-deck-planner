import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

const DEFAULT_THRESHOLD_PX = 8;

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
 * Horizontal pans are left to the parent scroll container (hand rail): we only
 * start a drag when movement is primarily vertical / diagonal, and we delay
 * pointer capture until the drag actually begins.
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
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dist = Math.hypot(dx, dy);
      if (!s.started) {
        if (dist < thresholdPx) return;
        // Prefer native horizontal scroll over treating a sideways pan as a drag.
        if (Math.abs(dx) > Math.abs(dy)) {
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
