/**
 * Run `fn` up to `attempts` times, waiting between tries. One place for the "free-tier host is cold, try again"
 * loops: token mints, the services warm-up poll and the Colyseus connect / reconnect.
 */
export type RetryOptions = {
  /** Total tries, the first included. `Infinity` leaves the stop to `shouldRetry`. */
  attempts: number;
  /** Wait before try number `attempt` (1 for the first retry). The first try never waits. */
  delayMs: (attempt: number) => number;
  /** Whether a failure of try `attempt` (0-based) is worth another go. Anything else is thrown as is. */
  shouldRetry: (error: unknown, attempt: number) => boolean;
  /** Runs after a failure that will be retried, before the wait (clean up the half-open connection here). */
  onRetry?: (error: unknown, attempt: number) => Promise<void> | void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resolves with the first success. Throws the last error as it came when it is not retryable or tries run out. */
export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= opts.attempts - 1 || !opts.shouldRetry(e, attempt)) throw e;
      await opts.onRetry?.(e, attempt);
    }
    await sleep(opts.delayMs(attempt + 1));
  }
}
