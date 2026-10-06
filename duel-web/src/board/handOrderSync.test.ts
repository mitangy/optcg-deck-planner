import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandOrderSender, HAND_ORDER_DEBOUNCE_MS } from "./handOrderSync";

describe("hand order sender", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends only the last of several quick changes (#346)", () => {
    const send = vi.fn();
    const s = createHandOrderSender(send);
    s.update(["a", "b", "c"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS - 10);
    s.update(["c", "b", "a"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS - 10);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(["c", "b", "a"]);
  });

  it("does not resend an order the room already has, even after a change that was undone (#346)", () => {
    const send = vi.fn();
    const s = createHandOrderSender(send);
    s.update(["a", "b"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS);
    s.update(["a", "b"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    // Sorted, then put back before the timer fired: nothing changed from the room's view.
    s.update(["b", "a"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS / 2);
    s.update(["a", "b"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    s.update(["b", "a"]);
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("cancel drops a pending send (#346)", () => {
    const send = vi.fn();
    const s = createHandOrderSender(send);
    s.update(["a"]);
    s.cancel();
    vi.advanceTimersByTime(HAND_ORDER_DEBOUNCE_MS * 2);
    expect(send).not.toHaveBeenCalled();
  });
});
