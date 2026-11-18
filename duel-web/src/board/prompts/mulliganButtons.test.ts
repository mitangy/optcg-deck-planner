import { describe, expect, it } from "vitest";
import { intentBtnClass } from "./PrimaryDock";

describe("mulligan buttons", () => {
  it("Keep opening hand is the gold primary button and Mulligan stays the outline one (#1343)", () => {
    const keep = intentBtnClass({ type: "mulligan", doMulligan: false }).split(" ");
    const redraw = intentBtnClass({ type: "mulligan", doMulligan: true }).split(" ");
    expect(keep).toContain("intent-btn-end");
    expect(redraw).not.toContain("intent-btn-end");
  });
});
