import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Inliers verifyPair reports per candidate label (default 0 = rejected). */
  inliers: {} as Record<string, number>,
  verified: [] as string[],
}));

vi.mock("./cardMatch", () => ({
  getCv: async () => ({}),
  QUERY_ORB_FEATURES: 500,
  resizeToHeight: async (image: ImageData) => image,
  extractQueryFeatures: async () => ({}),
  releaseFeatures: async () => {},
  toFeatures: () => ({ desc: {}, pts: [], width: 1, height: 1 }),
  verifyPair: async (_q: unknown, c: { label: string }) => {
    state.verified.push(c.label);
    const inliers = state.inliers[c.label] ?? 0;
    return { good: inliers, inliers, rejected: inliers ? "none" : "too-few-good" };
  },
}));
// The hash of the query is "0": a candidate's orderHash is its distance to it.
vi.mock("./cardOrder", () => ({
  computeOrderHash: () => "0",
  orderDistance: (_a: string, b: string) => Number(b),
}));

import { quantizeEmbedding, setScanEmbedder } from "./cardEmbed";
import {
  DEFAULT_WALK,
  matchRectified,
  orderByHash,
  walkStop,
  type ScanCandidate,
  type WalkPolicy,
} from "./cardScanMatch";

const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: "srgb" } as unknown as ImageData;
const cand = (cardId: string, orderHash: string): ScanCandidate => {
  const label = `${cardId}#${orderHash}`;
  // The mocked verifier reads the label back off the features it is handed.
  return { cardId, label, orderHash, features: { label } as unknown as ScanCandidate["features"] };
};

/** n candidates whose hash distance is their position, so catalog order == walk order. */
const catalog = (n: number) => Array.from({ length: n }, (_, i) => cand(`C${i}`, String(i)));
const reset = () => {
  state.inliers = {};
  state.verified = [];
};

describe("walkStop", () => {
  const policy: WalkPolicy = { minExamined: 8, confirmCap: 48, maxMs: 1500 };
  const at = (over: Partial<Parameters<typeof walkStop>[0]>) => ({
    best: 0,
    runnerUp: 0,
    examined: 1,
    total: 6000,
    elapsedMs: 0,
    ...over,
  });

  it("does not call a match sure until enough rivals were examined (#701)", () => {
    expect(walkStop(at({ best: 30, examined: 7 }), policy)).toBeNull();
    expect(walkStop(at({ best: 30, examined: 8 }), policy)).toBe("sure");
  });

  it("is sure only with the lead over the runner-up (#701)", () => {
    expect(walkStop(at({ best: 14, runnerUp: 10, examined: 8 }), policy)).toBeNull();
    expect(walkStop(at({ best: 15, runnerUp: 10, examined: 8 }), policy)).toBe("sure");
  });

  it("stops a confident but tied walk at the confirm cap instead of reading the catalog (#701)", () => {
    expect(walkStop(at({ best: 20, runnerUp: 19, examined: 47 }), policy)).toBeNull();
    expect(walkStop(at({ best: 20, runnerUp: 19, examined: 48 }), policy)).toBe("confirm-cap");
  });

  it("never treats a weak match as settled, only the time budget ends the walk (#701)", () => {
    expect(walkStop(at({ best: 9, examined: 500, elapsedMs: 1499 }), policy)).toBeNull();
    expect(walkStop(at({ best: 9, examined: 500, elapsedMs: 1500 }), policy)).toBe("budget");
  });

  it("does not cut the walk for time before the minimum was examined (#701)", () => {
    expect(walkStop(at({ best: 0, examined: 3, elapsedMs: 99999 }), policy)).toBeNull();
  });

  it("ends when the catalog is exhausted (#701)", () => {
    expect(walkStop(at({ best: 0, examined: 12, total: 12 }), policy)).toBe("exhausted");
  });
});

describe("orderByHash", () => {
  it("puts the nearest hash first and keeps catalog order among ties (#701)", () => {
    const out = orderByHash([cand("A", "5"), cand("B", "2"), cand("C", "2"), cand("D", "9")], "0");
    expect(out.map((c) => c.cardId)).toEqual(["B", "C", "A", "D"]);
  });

  it("sorts candidates without a hash last, never drops them (#701)", () => {
    const out = orderByHash([cand("A", ""), cand("B", "4")], "0");
    expect(out.map((c) => c.cardId)).toEqual(["B", "A"]);
  });
});

/** Dense unit directions (A = first half, B = second half) quantised like the shipped rows. */
const dir = (which: "A" | "B") => (which === "A" ? [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0] : [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]);
const unitRow = (which: "A" | "B") => quantizeEmbedding(dir(which));

describe("matchRectified with an embedder", () => {
  const withEmbedder = (query: number[]) =>
    setScanEmbedder({
      embed: async () => Float32Array.from(query),
      release: async () => {},
    });

  it("verifies the embedding's pick early even when the hash puts it far down (#701)", async () => {
    reset();
    const cands = catalog(80).map((c, i) => ({ ...c, embedding: unitRow(i === 70 ? "A" : "B") }));
    state.inliers = { "C70#70": 22 };
    withEmbedder(dir("A"));
    try {
      const m = await matchRectified(pixels, cands, undefined, DEFAULT_WALK, () => 0);
      expect(m?.cardId).toBe("C70");
      expect(m?.embedRank).toBe(0);
      // Hash order alone would need 71 verifications; fusion gets there in about ten.
      expect(state.verified.length).toBeLessThanOrEqual(12);
    } finally {
      setScanEmbedder(null);
    }
  });

  it("walks in hash order when candidates carry no embeddings (#701)", async () => {
    reset();
    state.inliers = { "C40#40": 22 };
    withEmbedder(dir("A"));
    try {
      const m = await matchRectified(pixels, catalog(80), undefined, DEFAULT_WALK, () => 0);
      expect(m?.cardId).toBe("C40");
      expect(m?.embedRank).toBeUndefined();
      expect(state.verified).toHaveLength(41);
    } finally {
      setScanEmbedder(null);
    }
  });

  it("falls back to the hash order when the embedder throws (#701)", async () => {
    reset();
    const cands = catalog(30).map((c) => ({ ...c, embedding: unitRow("A") }));
    state.inliers = { "C3#3": 20 };
    setScanEmbedder({
      embed: async () => {
        throw new Error("wasm out of memory");
      },
      release: async () => {},
    });
    try {
      const m = await matchRectified(pixels, cands, undefined, DEFAULT_WALK, () => 0);
      expect(m?.cardId).toBe("C3");
    } finally {
      setScanEmbedder(null);
    }
  });
});

describe("matchRectified walk", () => {
  it("verifies in hash order and stops at the first sure match after the minimum (#701)", async () => {
    reset();
    state.inliers = { "C0#0": 12 };
    const m = await matchRectified(pixels, catalog(100));
    expect(m?.cardId).toBe("C0");
    expect(state.verified).toHaveLength(DEFAULT_WALK.minExamined);
  });

  it("lets a rival inside the minimum window deny sure (#701)", async () => {
    reset();
    state.inliers = { "C0#0": 16, "C5#5": 14 };
    const m = await matchRectified(pixels, catalog(100));
    expect(m?.cardId).toBe("C0");
    expect(m?.runnerUp).toBe(14);
    expect(state.verified.length).toBeGreaterThan(DEFAULT_WALK.minExamined);
  });

  it("keeps the card a later, stronger match overtook as the runner-up (#701)", async () => {
    reset();
    state.inliers = { "C1#1": 12, "C4#4": 30 };
    const m = await matchRectified(pixels, catalog(100));
    expect(m?.cardId).toBe("C4");
    expect(m?.runnerUp).toBe(12);
  });

  it("does not count another printing of the same card as a rival (#701)", async () => {
    reset();
    // Two printings of one card, the second a little stronger, then a real rival.
    const cands = [cand("OP14-113", "0"), cand("OP14-113", "1"), cand("OP01-001", "2"), ...catalog(100).slice(3)];
    cands[1].label = "OP14-113#1b";
    (cands[1].features as unknown as { label: string }).label = "OP14-113#1b";
    state.inliers = { "OP14-113#0": 30, "OP14-113#1b": 34, "OP01-001#2": 11 };
    const m = await matchRectified(pixels, cands);
    expect(m?.cardId).toBe("OP14-113");
    expect(m?.inliers).toBe(34);
    expect(m?.runnerUp).toBe(11);
  });

  it("gives up on a card that never verifies when the time budget runs out, returning the weak best (#701)", async () => {
    reset();
    state.inliers = { "C2#2": 9 };
    let t = 0;
    const m = await matchRectified(pixels, catalog(6000), undefined, DEFAULT_WALK, () => (t += 10));
    expect(m?.cardId).toBe("C2");
    expect(m?.inliers).toBe(9);
    // 10 ms per tick, 1500 ms budget: nowhere near all 6000 candidates.
    expect(state.verified.length).toBeLessThan(200);
  });

  it("reaches a match that is last in the order when the budget allows (#701)", async () => {
    reset();
    state.inliers = { "C59#59": 20 };
    const m = await matchRectified(pixels, catalog(60), undefined, DEFAULT_WALK, () => 0);
    expect(m?.cardId).toBe("C59");
    expect(state.verified).toHaveLength(60);
  });

  it("returns null when nothing verifies (#701)", async () => {
    reset();
    expect(await matchRectified(pixels, catalog(20), undefined, DEFAULT_WALK, () => 0)).toBeNull();
  });
});
