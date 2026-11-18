export const LONG_PRESS_MS = 400;

export const MOVE_CANCEL_PX = 12;

// Deferred so a double-click can cancel select/target.
export const DOUBLE_CLICK_DELAY_MS = 280;

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function shouldCancelLongPress(
  startX: number,
  startY: number,
  x: number,
  y: number,
  thresholdPx: number = MOVE_CANCEL_PX,
): boolean {
  const t = thresholdPx * thresholdPx;
  return distanceSq(startX, startY, x, y) > t;
}

export type LongPressControllerOptions = {
  durationMs?: number;
  moveThresholdPx?: number;
  onLongPress: () => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export function createLongPressController(opts: LongPressControllerOptions) {
  const durationMs = opts.durationMs ?? LONG_PRESS_MS;
  const moveThresholdPx = opts.moveThresholdPx ?? MOVE_CANCEL_PX;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;

  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let activated = false;
  let cancelled = false;

  function clearTimer() {
    if (timerId != null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  }

  function reset() {
    clearTimer();
    pointerId = null;
    cancelled = false;
  }

  return {
    get activated() {
      return activated;
    },
    consumeActivated(): boolean {
      const was = activated;
      activated = false;
      return was;
    },
    onPointerDown(e: { pointerId: number; clientX: number; clientY: number }) {
      clearTimer();
      activated = false;
      cancelled = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      timerId = setTimeoutFn(() => {
        timerId = null;
        if (!cancelled && pointerId === e.pointerId) {
          activated = true;
          opts.onLongPress();
        }
      }, durationMs);
    },
    onPointerMove(e: { pointerId: number; clientX: number; clientY: number }) {
      if (pointerId !== e.pointerId || cancelled || activated) return;
      if (shouldCancelLongPress(startX, startY, e.clientX, e.clientY, moveThresholdPx)) {
        cancelled = true;
        clearTimer();
      }
    },
    onPointerUp(e: { pointerId: number }) {
      if (pointerId !== e.pointerId) return;
      clearTimer();
      pointerId = null;
    },
    onPointerCancel(e: { pointerId: number }) {
      if (pointerId !== e.pointerId) return;
      cancelled = true;
      reset();
    },
    cancel() {
      cancelled = true;
      clearTimer();
      pointerId = null;
    },
    dispose() {
      reset();
      activated = false;
    },
  };
}

export type ClickDeferControllerOptions = {
  delayMs?: number;
  onSingleClick: () => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

// Deferred so a double-click can cancel it.
export function createClickDeferController(opts: ClickDeferControllerOptions) {
  const delayMs = opts.delayMs ?? DOUBLE_CLICK_DELAY_MS;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return {
    onClick() {
      if (timerId != null) clearTimeoutFn(timerId);
      timerId = setTimeoutFn(() => {
        timerId = null;
        opts.onSingleClick();
      }, delayMs);
    },
    cancel() {
      if (timerId != null) {
        clearTimeoutFn(timerId);
        timerId = null;
      }
    },
    dispose() {
      if (timerId != null) {
        clearTimeoutFn(timerId);
        timerId = null;
      }
    },
  };
}

// The chip is not a Tab stop, so the keyboard needs its own way in.
export function isInspectKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  return (e.key === "i" || e.key === "I") && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

// A touch long-press also fires `contextmenu`, but that gesture already has its own inspect path. `pointerType` is undefined where contextmenu is a plain MouseEvent (Firefox).
export function shouldInspectOnContextMenu(finePointer: boolean, pointerType?: string): boolean {
  return finePointer && pointerType !== "touch";
}

export function inspectOnContextMenu(
  e: { preventDefault: () => void; nativeEvent: Event },
  open: () => void,
): void {
  const fine =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(FINE_POINTER_QUERY).matches;
  if (!shouldInspectOnContextMenu(fine, (e.nativeEvent as { pointerType?: string }).pointerType)) return;
  e.preventDefault();
  open();
}
