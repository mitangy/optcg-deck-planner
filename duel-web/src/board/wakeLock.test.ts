import { describe, expect, it, vi } from "vitest";
import { createWakeLockController, type WakeLockHandle } from "./wakeLock";

class FakeSentinel implements WakeLockHandle {
  released = false;
  private listeners = new Set<() => void>();
  addEventListener(_type: "release", l: () => void) {
    this.listeners.add(l);
  }
  removeEventListener(_type: "release", l: () => void) {
    this.listeners.delete(l);
  }
  // Like the real API, releasing (by us or the browser) dispatches "release".
  async release() {
    this.dispatchRelease();
  }
  dispatchRelease() {
    this.released = true;
    for (const l of [...this.listeners]) l();
  }
}

function setup(opts: { supported?: boolean; visible?: boolean } = {}) {
  let visible = opts.visible ?? true;
  const sentinels: FakeSentinel[] = [];
  const pending: Array<{ resolve: (s: FakeSentinel) => void; reject: (e: unknown) => void }> = [];
  let visListener: (() => void) | null = null;
  let deferred = false;
  let failNext = false;
  const controller = createWakeLockController({
    request:
      opts.supported === false
        ? null
        : () =>
            new Promise<WakeLockHandle>((resolve, reject) => {
              if (failNext) {
                failNext = false;
                reject(new Error("denied"));
                return;
              }
              const s = new FakeSentinel();
              sentinels.push(s);
              if (deferred) pending.push({ resolve: () => resolve(s), reject });
              else resolve(s);
            }),
    isVisible: () => visible,
    addVisibilityListener: (l) => {
      visListener = l;
      return () => {
        visListener = null;
      };
    },
  });
  return {
    controller,
    sentinels,
    deferNext: () => {
      deferred = true;
    },
    failNext: () => {
      failNext = true;
    },
    resolvePending: () => pending.shift()!.resolve(null as never),
    setVisible(v: boolean) {
      visible = v;
      // Real pages fire visibilitychange in both directions.
      visListener?.();
    },
    hasVisListener: () => visListener !== null,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createWakeLockController", () => {
  it("acquires a lock on start", async () => {
    const t = setup();
    t.controller.start();
    await flush();
    expect(t.sentinels).toHaveLength(1);
    expect(t.sentinels[0].released).toBe(false);
  });

  it("waits for the page to be visible before asking", async () => {
    const t = setup({ visible: false });
    t.controller.start();
    await flush();
    expect(t.sentinels).toHaveLength(0);
    t.setVisible(true);
    await flush();
    expect(t.sentinels).toHaveLength(1);
  });

  it("re-acquires after the browser drops the lock and the page is visible again", async () => {
    const t = setup();
    t.controller.start();
    await flush();
    // Tab hidden: the browser releases the lock on its own.
    t.setVisible(false);
    t.sentinels[0].dispatchRelease();
    await flush();
    expect(t.sentinels).toHaveLength(1);
    t.setVisible(true);
    await flush();
    expect(t.sentinels).toHaveLength(2);
    expect(t.sentinels[1].released).toBe(false);
  });

  it("does not stack requests while a lock is held or in flight", async () => {
    const t = setup();
    t.deferNext();
    t.controller.start();
    t.setVisible(true);
    t.setVisible(true);
    await flush();
    expect(t.sentinels).toHaveLength(1);
    t.resolvePending();
    await flush();
    t.setVisible(true);
    await flush();
    expect(t.sentinels).toHaveLength(1);
  });

  it("releases the lock on stop", async () => {
    const t = setup();
    t.controller.start();
    await flush();
    t.controller.stop();
    expect(t.sentinels[0].released).toBe(true);
  });

  it("does not re-acquire after stop", async () => {
    const t = setup();
    t.controller.start();
    await flush();
    t.controller.stop();
    t.setVisible(true);
    t.sentinels[0].dispatchRelease();
    await flush();
    expect(t.sentinels).toHaveLength(1);
    expect(t.hasVisListener()).toBe(false);
  });

  it("releases a lock that is granted after stop", async () => {
    const t = setup();
    t.deferNext();
    t.controller.start();
    await flush();
    t.controller.stop();
    t.resolvePending();
    await flush();
    expect(t.sentinels[0].released).toBe(true);
  });

  it("keeps trying on later visibility changes after a denied request", async () => {
    const t = setup();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    t.failNext();
    t.controller.start();
    await flush();
    expect(t.sentinels).toHaveLength(0);
    t.setVisible(true);
    await flush();
    expect(t.sentinels).toHaveLength(1);
    debug.mockRestore();
  });

  it("is a no-op when the Wake Lock API is unsupported", async () => {
    const t = setup({ supported: false });
    expect(() => {
      t.controller.start();
      t.setVisible(true);
      t.controller.stop();
    }).not.toThrow();
    await flush();
    expect(t.sentinels).toHaveLength(0);
  });
});
