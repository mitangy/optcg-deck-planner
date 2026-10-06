import { describe, expect, it } from "vitest";
import { LAYOUT_RESET, layoutMoved } from "./layoutReset";

const DEFAULT = { panelLayout: "", panelSizes: "", handFanPos: "", oppHandSpot: "", spectatorNearFanPos: "", spectatorFarFanPos: "" };
const PIECES = ["panelLayout", "panelSizes", "handFanPos", "oppHandSpot", "spectatorNearFanPos", "spectatorFarFanPos"] as const;

describe("Reset layout", () => {
  it("is offered, and puts back, each moved piece of the layout including both spectator fans (#346)", () => {
    expect(layoutMoved(DEFAULT)).toBe(false);
    for (const key of PIECES) {
      const moved = { ...DEFAULT, [key]: key === "oppHandSpot" ? "left" : "0.4,0.5" };
      expect(layoutMoved(moved), key).toBe(true);
      expect(layoutMoved({ ...moved, ...LAYOUT_RESET }), key).toBe(false);
    }
  });
});
