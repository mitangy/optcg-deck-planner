import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./constants";
import { parseCosmeticsMessage } from "./clientMessages";

const cosmetics = (artPrefs: unknown) => parseCosmeticsMessage({ protocolVersion: PROTOCOL_VERSION, artPrefs });

describe("cosmetics art preferences (#1345)", () => {
  it("skips an entry whose key or value is too long to be a card id or an art id (#1345)", () => {
    const out = cosmetics({
      "PRB01-001": "p1",
      ["K".repeat(33)]: "p1",
      "OP01-001": "v".repeat(65),
      ["K".repeat(32)]: "v".repeat(64),
    });
    expect(Object.keys(out).sort()).toEqual(["K".repeat(32), "PRB01-001"].sort());
    expect(out["PRB01-001"]).toBe("p1");
  });
});
