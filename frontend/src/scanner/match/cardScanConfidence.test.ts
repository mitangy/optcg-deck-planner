import { describe, expect, it } from "vitest";
import { SURE_EMBED_RANK, classifyMatch } from "./cardScanMulti";

describe("classifyMatch with the art embedding", () => {
  it("is sure when the embedding ranks the matched card near the top (#701)", () => {
    expect(classifyMatch({ inliers: 30, runnerUp: 0, embedRank: 0 })).toBe("sure");
    expect(classifyMatch({ inliers: 30, runnerUp: 0, embedRank: SURE_EMBED_RANK - 1 })).toBe("sure");
  });

  it("downgrades a confident geometric match the embedding does not believe (#701)", () => {
    expect(classifyMatch({ inliers: 30, runnerUp: 0, embedRank: SURE_EMBED_RANK })).toBe("check");
    expect(classifyMatch({ inliers: 17, runnerUp: 0, embedRank: 3841 })).toBe("check");
  });

  it("without an embedder the geometric rule alone decides (#701)", () => {
    expect(classifyMatch({ inliers: 12, runnerUp: 0 })).toBe("sure");
    expect(classifyMatch({ inliers: 12, runnerUp: 8 })).toBe("check");
  });

  it("never upgrades: a weak match stays a check however the embedding ranks it (#701)", () => {
    expect(classifyMatch({ inliers: 9, runnerUp: 0, embedRank: 0 })).toBe("check");
    expect(classifyMatch({ inliers: 0, runnerUp: 0, embedRank: 0 })).toBe("none");
  });
});
