/** Jittered exponential backoff for the rate-limit, overload and server errors the API returns. */

export function retriable(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 429 || status === 529 || status >= 500;
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}` : String(err));
}

export type RetryOptions = { tries?: number; baseMs?: number; signal?: AbortSignal; onRetry?: (n: number, err: unknown) => void };

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const tries = opts.tries ?? 4;
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (n >= tries || !retriable(err) || opts.signal?.aborted) throw err;
      opts.onRetry?.(n, err);
      const wait = (opts.baseMs ?? 1000) * 2 ** (n - 1) * (0.5 + Math.random());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
}
