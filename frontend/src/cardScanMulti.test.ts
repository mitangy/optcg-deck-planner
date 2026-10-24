import { describe, expect, it, vi } from "vitest";
import type { DetectedCard } from "./cardDetect";
import type { Quad } from "./cardRectify";
import type { ScanMatch } from "./cardScanMatch";

const state = vi.hoisted(() => ({
  cards: [] as DetectedCard[],
  /** What `matchRectified` returns, in call order. */
  results: [] as ({ cardId: string; inliers: number; runnerUp: number } | null)[],
}));

vi.mock("./cardMatch", () => ({ getCv: async () => ({}) }));
vi.mock("./cardDetect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cardDetect")>()),
  detectCardsAsync: async () => state.cards,
}));
vi.mock("./cardScanMatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cardScanMatch")>()),
  matchRectified: async (): Promise<ScanMatch | null> => {
    const m = state.results.shift();
    return m ? { cardId: m.cardId, label: m.cardId, inliers: m.inliers, runnerUp: m.runnerUp, examined: 1 } : null;
  },
}));

import { classifyMatch, matchAllCardsWith } from "./cardScanMulti";
describe("classifyMatch", () => {
  it("is sure only with enough inliers and a clear lead over the runner-up (#701)", () => {
    expect(classifyMatch({ inliers: 10, runnerUp: 5 })).toBe("sure");
    expect(classifyMatch({ inliers: 10, runnerUp: 6 })).toBe("check");
    expect(classifyMatch({ inliers: 9, runnerUp: 0 })).toBe("check");
    expect(classifyMatch({ inliers: 24, runnerUp: 0 })).toBe("sure");
  });

  it("is none when nothing verified (#701)", () => {
    expect(classifyMatch(null)).toBe("none");
    expect(classifyMatch({ inliers: 0, runnerUp: 0 })).toBe("none");
  });
});

const box = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const photo = { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: "srgb" } as unknown as ImageData;
const run = () => matchAllCardsWith({ thumbnail: () => "" }, photo, []);

describe("matchAllCardsWith touching blocks", () => {
  const order = (results: typeof state.results) => {
    state.results = [...results];
  };
  const whole = box(0, 0, 200, 140);
  const cells = (): DetectedCard[] => [
    { quad: box(0, 0, 100, 140), whole },
    { quad: box(100, 0, 100, 140), whole },
  ];

  it("reads a block as one card when none of its cells identify (#701)", async () => {
    state.cards = cells();
    order([null, null, { cardId: "OP01-001", inliers: 30, runnerUp: 0 }]);
    const items = await run();
    expect(items).toHaveLength(1);
    expect(items[0].cardId).toBe("OP01-001");
    expect(items[0].quad).toBe(whole);
  });

  it("keeps the cells when they identify (#701)", async () => {
    state.cards = cells();
    // The third result is what the whole block would read as; it must go unused.
    order([
      { cardId: "OP01-001", inliers: 30, runnerUp: 0 },
      { cardId: "OP01-002", inliers: 30, runnerUp: 0 },
      { cardId: "OP01-003", inliers: 30, runnerUp: 0 },
    ]);
    const items = await run();
    expect(items.map((i) => i.cardId)).toEqual(["OP01-001", "OP01-002"]);
  });

  it("keeps the cells when the whole block does not identify either (#701)", async () => {
    state.cards = cells();
    order([null, null, null]);
    const items = await run();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.confidence === "none")).toBe(true);
  });

  it("does not try a block that is not card-shaped as one card (#701)", async () => {
    const row = box(0, 0, 360, 140);
    state.cards = [0, 1, 2].map((i) => ({ quad: box(i * 120, 0, 120, 140), whole: row }));
    order([null, null, null, { cardId: "OP01-001", inliers: 30, runnerUp: 0 }]);
    const items = await run();
    expect(items).toHaveLength(3);
  });
});
