import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

const DEFAULT_THRESHOLD_PX = 8;

export type PanAxis = "x" | "y" | "none";

export type DragDecision = "wait" | "start" | "cancel";

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
  enabled: boolean;
  payload: T;
  thresholdPx?: number;
  onDragStart?: (payload: T) => void;
  onDragEnd?: (payload: T, clientX: number, clientY: number) => void;
  onDragCancel?: () => void;
  // Hand rows scroll sideways, so the default keeps pan-x; a board card that has nowhere to scroll uses "none" so a sideways attack drag is never taken over by the browser.
  idleTouchAction?: "pan-x" | "pan-y" | "none";
};

export function usePointerDrag<T>({
  enabled,
  payload,
  thresholdPx = DEFAULT_THRESHOLD_PX,
  onDragStart,
  onDragEnd,
  onDragCancel,
  idleTouchAction = "pan-x",
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

  const [pressId, setPressId] = useState<number | null>(null);

  const reset = useCallback(() => {
    startRef.current = null;
    setDragging(false);
    setPressId(null);
  }, []);

  // Turning off mid-drag drops the handlers, so the up / cancel that would end the drag never arrives. End it here so callers can undo what drag start did.
  const onDragCancelRef = useRef(onDragCancel);
  onDragCancelRef.current = onDragCancel;
  useEffect(() => {
    if (enabled || !startRef.current?.started) return;
    reset();
    onDragCancelRef.current?.();
  }, [enabled, reset]);

  useEffect(() => {
    if (pressId === null) return;
    const onWindowEnd = (e: PointerEvent) => {
      const s = startRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      reset();
      if (s.started) onDragCancelRef.current?.();
    };
    window.addEventListener("pointerup", onWindowEnd);
    window.addEventListener("pointercancel", onWindowEnd);
    return () => {
      window.removeEventListener("pointerup", onWindowEnd);
      window.removeEventListener("pointercancel", onWindowEnd);
    };
  }, [pressId, reset]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // A touch drag ends without a click, so the swallow flag it set would eat the next real tap. A new press starts a new gesture.
      suppressClickRef.current = false;
      // A stuck drag must never survive a new press.
      if (startRef.current?.started) {
        reset();
        onDragCancel?.();
      }
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
      setPressId(e.pointerId);
    },
    [enabled, onDragCancel, reset],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const s = startRef.current;
      if (!s?.armed || s.pointerId !== e.pointerId) return;
      // Mouse button no longer held: the press is stale (its up went elsewhere).
      if (s.pointerType === "mouse" && (e.buttons & 1) === 0) {
        const started = s.started;
        reset();
        if (started) onDragCancel?.();
        return;
      }
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
          s.armed = false;
          return;
        }
        s.started = true;
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          // The pointer may already be gone.
        }
        onDragStart?.(payload);
      }
    },
    [onDragStart, onDragCancel, payload, reset, thresholdPx],
  );

  const finish = useCallback(
    (e: ReactPointerEvent, cancelled: boolean) => {
      const s = startRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const started = s.started;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // Already released.
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
          style: {
            touchAction: dragging ? "none" : idleTouchAction,
          },
        }
      : {},
  };
}
