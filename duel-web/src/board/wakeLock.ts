import { useEffect } from "react";

/** The slice of WakeLockSentinel the controller needs. */
export type WakeLockHandle = {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
  removeEventListener(type: "release", listener: () => void): void;
};

export type WakeLockDeps = {
  /** null when the browser has no Screen Wake Lock API: the controller is then a no-op. */
  request: (() => Promise<WakeLockHandle>) | null;
  isVisible: () => boolean;
  /** Subscribe to visibility changes; returns the unsubscribe function. */
  addVisibilityListener: (listener: () => void) => () => void;
};

export type WakeLockController = { start(): void; stop(): void };

/**
 * Holds a screen wake lock while started. Browsers drop the lock whenever the
 * tab is hidden, so it is requested again when the page becomes visible.
 */
export function createWakeLockController(deps: WakeLockDeps): WakeLockController {
  const { request, isVisible, addVisibilityListener } = deps;
  let started = false;
  let requesting = false;
  let handle: WakeLockHandle | null = null;
  let unsubscribe: (() => void) | null = null;

  function onReleased() {
    // The browser released it (tab hidden, battery saver). Come back when we can.
    handle = null;
    acquire();
  }

  function acquire() {
    if (!started || !request || handle || requesting || !isVisible()) return;
    requesting = true;
    request().then(
      (sentinel) => {
        requesting = false;
        if (!started) {
          // stop() ran while the request was in flight: do not keep the lock.
          void sentinel.release().catch(() => {});
          return;
        }
        handle = sentinel;
        sentinel.addEventListener("release", onReleased);
      },
      (err) => {
        // Denied (battery saver, permissions policy). Playing without it is fine.
        requesting = false;
        console.debug("Screen wake lock unavailable", err);
      },
    );
  }

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribe = addVisibilityListener(acquire);
      acquire();
    },
    stop() {
      if (!started) return;
      started = false;
      unsubscribe?.();
      unsubscribe = null;
      if (handle) {
        handle.removeEventListener("release", onReleased);
        void handle.release().catch(() => {});
        handle = null;
      }
    },
  };
}

/** Keeps the phone from dimming / locking while `active` (e.g. during the opponent's long turn). */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockHandle> } })
      .wakeLock;
    const controller = createWakeLockController({
      request: wakeLock ? () => wakeLock.request("screen") : null,
      isVisible: () => document.visibilityState === "visible",
      addVisibilityListener: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    controller.start();
    return () => controller.stop();
  }, [active]);
}
