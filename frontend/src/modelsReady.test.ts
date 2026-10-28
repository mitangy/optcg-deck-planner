import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCardsAsync, setCardModelDetector, type DetectedCard } from "./cardDetect";
import type { Cv } from "./cardMatch";
import { waitForModels } from "./modelsReady";

const photo = { width: 10, height: 10, data: new Uint8ClampedArray(400) } as ImageData;
const learnedCards = [{ quad: [], score: 0.9 }] as unknown as DetectedCard[];

/** OpenCV stand-in that cannot detect anything: reaching it means the model was not used. */
const brokenCv = {} as Cv;

afterEach(() => {
  setCardModelDetector(null);
  vi.useRealTimers();
});

describe("waitForModels", () => {
  it("a multi scan started while the detector is still loading uses it once loaded (#764)", async () => {
    vi.useFakeTimers();
    const loading = new Promise<void>((resolve) =>
      setTimeout(() => {
        setCardModelDetector(async () => learnedCards);
        resolve();
      }, 3000),
    );
    const scan = (async () => {
      await waitForModels(loading, 30_000);
      return detectCardsAsync(brokenCv, photo);
    })();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await scan).toBe(learnedCards);
  });

  it("stops waiting after the timeout when the models never finish loading (#764)", async () => {
    vi.useFakeTimers();
    const result = waitForModels(new Promise(() => {}), 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toBe(false);
  });

  it("still proceeds when loading fails (#764)", async () => {
    expect(await waitForModels(Promise.reject(new Error("boom")), 1000)).toBe(true);
  });
});
