/**
 * A tab left open across a deploy still asks for the old build's chunk files, which the new deploy no longer
 * serves (assets 404), so opening a page that loads on demand (Settings, History, the board...) fails and
 * the screen goes blank or nothing happens. When that happens, reload the page once: the reload fetches the
 * new build at the same URL. A reload that happened in the last minute is not repeated, so a chunk that is
 * really missing (or a device that is offline) shows the error instead of reloading forever.
 */
const KEY = "optcg-duel:stale-chunk-reload";
const RETRY_AFTER_MS = 60_000;

/** The browsers' messages for a dynamic import whose file could not be fetched or parsed. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    msg,
  );
}

type Env = {
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  now: () => number;
};

function defaultEnv(): Env {
  let storage: Env["storage"] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return { storage, reload: () => window.location.reload(), now: () => Date.now() };
}

/**
 * Wraps a dynamic import: a stale-chunk failure reloads the page once (and never settles, so React keeps
 * the current screen until the reload lands); any other failure, or a second one within a minute, is thrown.
 */
export function reloadOnStaleChunk<T>(load: () => Promise<T>, env: Env = defaultEnv()): () => Promise<T> {
  return () =>
    load().catch((err: unknown) => {
      if (!isStaleChunkError(err)) throw err;
      let last = 0;
      try {
        last = Number(env.storage?.getItem(KEY) ?? 0) || 0;
      } catch {
        last = 0;
      }
      if (env.now() - last < RETRY_AFTER_MS) throw err;
      try {
        env.storage?.setItem(KEY, String(env.now()));
      } catch {
        // Private mode without storage: still reload once for this page load.
      }
      env.reload();
      return new Promise<T>(() => {});
    });
}
