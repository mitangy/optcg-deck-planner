import { describe, expect, it, vi } from "vitest";
import { reloadOnStaleChunk } from "./staleChunk";

function env(start = 1_000_000) {
  const store = new Map<string, string>();
  let t = start;
  return {
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    reload: vi.fn(),
    now: () => t,
    advance: (ms: number) => (t += ms),
  };
}
const stale = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /assets/SettingsPage-abc.js"));
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("pages that load on demand after a deploy (#1262)", () => {
  it("reloads the page once when a deploy replaced the chunk Settings asks for (#1262)", async () => {
    const e = env();
    void reloadOnStaleChunk(stale, e)();
    await settle();
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  it("shows the error instead of reloading again within a minute, so a missing chunk never loops (#1262)", async () => {
    const e = env();
    void reloadOnStaleChunk(stale, e)();
    await settle();
    e.advance(5_000);
    await expect(reloadOnStaleChunk(stale, e)()).rejects.toThrow(/dynamically imported/);
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for other errors thrown while loading a page (#1262)", async () => {
    const e = env();
    await expect(reloadOnStaleChunk(() => Promise.reject(new Error("boom")), e)()).rejects.toThrow("boom");
    expect(e.reload).not.toHaveBeenCalled();
  });
});
