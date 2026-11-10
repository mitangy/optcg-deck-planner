import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retry } from "./retry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const always = () => true;
/** A function that fails its first `n` calls, then answers "ok". */
function failing(n: number) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (calls <= n) throw new Error(`fail ${calls}`);
    return "ok";
  });
}

describe("retry (#1224)", () => {
  it("returns the first success without waiting", async () => {
    const fn = failing(0);
    await expect(retry(fn, { attempts: 3, delayMs: () => 1000, shouldRetry: always })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits delayMs(i) before retry number i, then succeeds", async () => {
    const fn = failing(2);
    const asked: number[] = [];
    const p = retry(fn, { attempts: 3, delayMs: (i) => (asked.push(i), 400 * i), shouldRetry: always });
    await vi.advanceTimersByTimeAsync(399);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(799);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe("ok");
    expect(asked).toEqual([1, 2]);
  });

  it("stops after `attempts` tries and throws the last error", async () => {
    const fn = failing(10);
    const caught = retry(fn, { attempts: 3, delayMs: () => 10, shouldRetry: always }).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await caught).toBe("fail 3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws at once when shouldRetry says no, and hands it the error and the attempt", async () => {
    const fn = failing(10);
    const shouldRetry = vi.fn(() => false);
    await expect(retry(fn, { attempts: 5, delayMs: () => 10, shouldRetry })).rejects.toThrow("fail 1");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(expect.objectContaining({ message: "fail 1" }), 0);
  });

  it("runs onRetry after a retried failure and before the wait, not after the last one", async () => {
    const fn = failing(10);
    const order: string[] = [];
    const done = retry(fn, {
      attempts: 2,
      delayMs: () => (order.push("wait"), 10),
      shouldRetry: always,
      onRetry: (_e, i) => void order.push(`retry${i}`),
    }).catch(() => order.push("thrown"));
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(order).toEqual(["retry0", "wait", "thrown"]);
  });
});
