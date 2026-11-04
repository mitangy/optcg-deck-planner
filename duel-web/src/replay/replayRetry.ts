import { ReplayLoadError } from "./replayApi";

/** Seconds to wait before each retry while the server is still closing the game (the replay answers 409 until then). */
export const IN_PROGRESS_RETRY_DELAYS_S = [2, 4, 8];

/** Router state the match-over card's "Review game" link passes: the game just ended, so its replay may still be saving. */
export type ReplayNavState = { fromMatchOver?: boolean } | null;

/**
 * Runs `load`, and while it fails with an "in-progress" ReplayLoadError waits the next delay and tries again
 * (`onWait` fires before each wait). Any other error, or the last in-progress error, is thrown as is.
 * `cancelled` stops the waiting early when the page has gone away.
 */
export async function loadWhileSaving<T>(
  load: () => Promise<T>,
  opts: {
    delaysS?: readonly number[];
    wait?: (ms: number) => Promise<void>;
    onWait?: () => void;
    cancelled?: () => boolean;
  } = {},
): Promise<T> {
  const delays = opts.delaysS ?? IN_PROGRESS_RETRY_DELAYS_S;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try {
      return await load();
    } catch (e) {
      const again = e instanceof ReplayLoadError && e.reason === "in-progress" && i < delays.length && !opts.cancelled?.();
      if (!again) throw e;
      opts.onWait?.();
      await wait(delays[i]! * 1000);
    }
  }
}
