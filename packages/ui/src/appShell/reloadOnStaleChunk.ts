const STORAGE_KEY = "optcg:chunk-reload-at";
const GUARD_MS = 10_000;

// A tab opened before a deploy points at old lazy-route chunks that now 404, so reload once on `vite:preloadError`.
// A reload within GUARD_MS of the last one is not repeated, so a really missing chunk surfaces its error instead of looping.
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
