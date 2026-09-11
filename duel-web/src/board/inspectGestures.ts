/** Long-press duration before opening card inspect (touch / pointer). */
export const LONG_PRESS_MS = 400;

/** Cancel long-press if the pointer moves farther than this (px) — room for future drag. */
export const MOVE_CANCEL_PX = 12;

/** Defer single-click so a double-click can cancel select/target. */
export const DOUBLE_CLICK_DELAY_MS = 280;

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** True when movement from start exceeds the cancel threshold. */
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

/**
 * Pure-ish long-press tracker for pointer events.
 * Call down → optional move → up/cancel. Fires `onLongPress` once if held still.
 */
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
    /** Consume the activated flag (e.g. suppress the following click). */
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
    /** Abort an in-flight long-press (e.g. pointer-drag armed past threshold). */
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

/** Defer a single click so double-click can cancel it. */
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
