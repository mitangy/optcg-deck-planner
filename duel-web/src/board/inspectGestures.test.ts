import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOUBLE_CLICK_DELAY_MS,
  LONG_PRESS_MS,
  MOVE_CANCEL_PX,
  createClickDeferController,
  createLongPressController,
  shouldCancelLongPress,
} from "./inspectGestures";

describe("shouldCancelLongPress", () => {
  it("stays false within the default threshold", () => {
    expect(shouldCancelLongPress(0, 0, MOVE_CANCEL_PX, 0)).toBe(false);
    expect(shouldCancelLongPress(10, 10, 10 + MOVE_CANCEL_PX - 1, 10)).toBe(false);
  });

  it("cancels when movement exceeds the threshold", () => {
    expect(shouldCancelLongPress(0, 0, MOVE_CANCEL_PX + 1, 0)).toBe(true);
    expect(shouldCancelLongPress(0, 0, 0, MOVE_CANCEL_PX + 1)).toBe(true);
    expect(shouldCancelLongPress(0, 0, 9, 9, 12)).toBe(true); // 81+81=162 > 144
    expect(shouldCancelLongPress(0, 0, 8, 8, 12)).toBe(false); // 64+64=128 < 144
  });

  it("respects a custom threshold", () => {
    expect(shouldCancelLongPress(0, 0, 5, 0, 4)).toBe(true);
    expect(shouldCancelLongPress(0, 0, 4, 0, 4)).toBe(false);
  });
});

describe("createLongPressController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires after LONG_PRESS_MS when the pointer stays still", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const c = createLongPressController({ onLongPress });
    c.onPointerDown({ pointerId: 1, clientX: 100, clientY: 50 });
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(c.activated).toBe(true);
    expect(c.consumeActivated()).toBe(true);
    expect(c.activated).toBe(false);
  });

  it("cancels when the pointer moves beyond the threshold before the timer", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const c = createLongPressController({ onLongPress });
    c.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
    c.onPointerMove({ pointerId: 1, clientX: MOVE_CANCEL_PX + 2, clientY: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(c.activated).toBe(false);
  });

  it("does not cancel for small movement within threshold", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const c = createLongPressController({ onLongPress });
    c.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
    c.onPointerMove({ pointerId: 1, clientX: MOVE_CANCEL_PX - 1, clientY: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on pointer up before duration", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const c = createLongPressController({ onLongPress });
    c.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
    c.onPointerUp({ pointerId: 1 });
    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores move/up for a different pointerId", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const c = createLongPressController({ onLongPress });
    c.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
    c.onPointerMove({ pointerId: 2, clientX: 100, clientY: 100 });
    c.onPointerUp({ pointerId: 2 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe("createClickDeferController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers single click by DOUBLE_CLICK_DELAY_MS", () => {
    vi.useFakeTimers();
    const onSingleClick = vi.fn();
    const c = createClickDeferController({ onSingleClick });
    c.onClick();
    expect(onSingleClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS - 1);
    expect(onSingleClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSingleClick).toHaveBeenCalledTimes(1);
  });

  it("cancel prevents the deferred click (double-click path)", () => {
    vi.useFakeTimers();
    const onSingleClick = vi.fn();
    const c = createClickDeferController({ onSingleClick });
    c.onClick();
    c.cancel();
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS + 50);
    expect(onSingleClick).not.toHaveBeenCalled();
  });
});
