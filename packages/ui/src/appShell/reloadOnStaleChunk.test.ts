// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadOnStaleChunk } from "./reloadOnStaleChunk";

const reload = vi.fn();
let installed: EventListener | null = null;

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  vi.stubGlobal("location", { reload });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type: string, fn: any, opts?: any) => {
    if (type === "vite:preloadError") installed = fn;
    add(type, fn, opts);
  });
  reloadOnStaleChunk();
});

afterEach(() => {
  if (installed) window.removeEventListener("vite:preloadError", installed);
  installed = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function preloadError() {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("reloading when a lazy route chunk is gone after a deploy (#1074)", () => {
  it("a vite:preloadError reloads the page once and keeps the error from surfacing (#1074)", () => {
    const event = preloadError();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("a second vite:preloadError within the guard window does not reload again (#1074)", () => {
    preloadError();
    const second = preloadError();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("reloads again once the guard window has passed (#1074)", () => {
    vi.useFakeTimers();
    preloadError();
    vi.advanceTimersByTime(11_000);
    preloadError();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
