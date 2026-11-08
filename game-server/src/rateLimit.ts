/**
 * At most `limit` hits per `windowMs` for each key (a client's session id). A refused hit is not
 * counted. `now` is injected so tests can run it on a fake clock.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** Count a hit for `key`; false when it is over the limit. */
  consume(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t >= now - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drop what is remembered for `key` (its connection is gone). */
  forget(key: string): void {
    this.hits.delete(key);
  }
}
