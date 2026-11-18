// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settledAfter(call: () => Promise<unknown>, ms: number) {
  let settled = false;
  const p = call().catch(() => undefined).finally(() => (settled = true));
  await vi.advanceTimersByTimeAsync(ms);
  const result = settled;
  await vi.advanceTimersByTimeAsync(200_000);
  await p;
  return result;
}

describe("request time limits (#1346)", () => {
  it("an ordinary call gives up after 30 seconds (#1346)", async () => {
    expect(await settledAfter(() => api.decks(), 31_000)).toBe(true);
  });

  it.each([
    ["deck import", () => api.createDeck("d", "1 OP01-001")],
    ["receipt match", () => api.matchGroupBuyReceipt(1, "r")],
    ["receipt apply", () => api.applyGroupBuyReceipt(1, { receipt_text: "r" })],
    ["scan upload", () => api.uploadScanSamples([])],
  ])("%s keeps waiting past 30 seconds (#1346)", async (_name, call) => {
    expect(await settledAfter(call, 31_000)).toBe(false);
  });
});
