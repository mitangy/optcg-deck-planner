// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPolling } from "./usePolling";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}
function fireVisibility(state: "visible" | "hidden") {
  setVisibility(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("startPolling (refactor 3.4a)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("loads at once, then on every interval while the tab is visible", () => {
    const load = vi.fn();
    const stop = startPolling(load, 1000);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(load).toHaveBeenCalledTimes(4);
    stop();
  });

  it("skips interval ticks while the tab is hidden", () => {
    const load = vi.fn();
    const stop = startPolling(load, 1000);
    setVisibility("hidden");
    vi.advanceTimersByTime(3000);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("loads again when the tab becomes visible, not when it is hidden", () => {
    const load = vi.fn();
    const stop = startPolling(load, 60_000);
    fireVisibility("hidden");
    expect(load).toHaveBeenCalledTimes(1);
    fireVisibility("visible");
    expect(load).toHaveBeenCalledTimes(2);
    stop();
  });

  it("with no interval it loads now and on coming back, but never on a timer", () => {
    const load = vi.fn();
    const stop = startPolling(load, null);
    vi.advanceTimersByTime(120_000);
    expect(load).toHaveBeenCalledTimes(1);
    fireVisibility("visible");
    expect(load).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops the timer and the visibility listener", () => {
    const load = vi.fn();
    const stop = startPolling(load, 1000);
    stop();
    vi.advanceTimersByTime(5000);
    fireVisibility("visible");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
