import { describe, expect, it, vi } from "vitest";
import type { CosmeticKind } from "./net/prefsApi";
import { buildSharedSkin, type SkinSources } from "./skinShare";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const PATH = "/duel/cosmetics/12/public/AbCdEf_GhIjKl-MnOp";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("buildSharedSkin", () => {
  it("sends an account upload's public_path instead of a data URL, a data URL for art without one, and the DON!! art id (#389)", async () => {
    const dataUrl = vi.fn(async (_kind: CosmeticKind) => JPEG);
    const sources: SkinSources = {
      publicPath: (kind) => (kind === "playmat" ? PATH : null),
      dataUrl,
      donArt: () => 512345,
    };
    const shared = await buildSharedSkin({}, sources);
    expect(shared).toEqual({ skin: { playmat: PATH, cardBack: JPEG, donArt: 512345 }, usesPath: true });
    // The playmat is never shrunk to base64 when it has a path.
    expect(dataUrl.mock.calls.map(([k]) => k)).toEqual(["cardBack"]);
  });
});
