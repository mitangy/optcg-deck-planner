const STORAGE_KEY = "optcg:chunk-reload-at";
const GUARD_MS = 10_000;

/**
 * After a deploy, a tab opened before it still points at the old lazy-route chunks, which now 404, and
 * the failed dynamic import would unmount the whole app. Vite fires `vite:preloadError` for that: reload
 * once to pick up the new build. A reload within GUARD_MS of the last one is not repeated, so a chunk
 * that is really missing surfaces its error instead of looping.
 */
export function reloadOnStaleChunk(): void {
  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now();
    try {
      const last = Number(sessionStorage.getItem(STORAGE_KEY));
      if (last && now - last < GUARD_MS) return;
      sessionStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      return; // no storage means no loop guard, so do not risk reloading forever
    }
    event.preventDefault();
    window.location.reload();
  });
}
