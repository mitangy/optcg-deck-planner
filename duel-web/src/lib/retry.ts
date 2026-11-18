export type RetryOptions = {
  attempts: number;
  delayMs: (attempt: number) => number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => Promise<void> | void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
