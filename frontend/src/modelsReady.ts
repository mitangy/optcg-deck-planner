/** Wait for the learned card detector and art embedder to finish loading (#764).
 *
 * They load in the background after the scan data is ready (see `useScanData`),
 * which takes a few seconds the first time. A multi-card scan started before
 * that finishes would silently use the OpenCV outline finder, which misses
 * most cards on a real photo. So the multi scan waits here first, but only up
 * to a limit: a stuck download must still end in a scan, not a spinner.
 */

/** Longest a scan waits for the models before using OpenCV instead. */
export const MODELS_WAIT_MS = 30_000;

/** Resolves true when `pending` settled in time, false when the wait timed out. */
export async function waitForModels(pending: Promise<unknown>, timeoutMs = MODELS_WAIT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([pending.then(() => true as const, () => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
