import { useEffect } from "react";

export type WakeLockHandle = {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
  removeEventListener(type: "release", listener: () => void): void;
};

export type WakeLockDeps = {
  request: (() => Promise<WakeLockHandle>) | null;
  isVisible: () => boolean;
  addVisibilityListener: (listener: () => void) => () => void;
};

export type WakeLockController = { start(): void; stop(): void };

export function createWakeLockController(deps: WakeLockDeps): WakeLockController {
  const { request, isVisible, addVisibilityListener } = deps;
  let started = false;
  let requesting = false;
  let handle: WakeLockHandle | null = null;
  let unsubscribe: (() => void) | null = null;

  function onReleased() {
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
          void sentinel.release().catch(() => {});
          return;
        }
        handle = sentinel;
        sentinel.addEventListener("release", onReleased);
      },
      (err) => {
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
