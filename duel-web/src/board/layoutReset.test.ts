import { describe, expect, it } from "vitest";
import { LAYOUT_RESET, layoutMoved } from "./layoutReset";

const DEFAULT = { panelLayout: "", panelSizes: "", handFanPos: "", oppHandSpot: "", spectatorNearFanPos: "", spectatorFarFanPos: "", promptPos: "", promptDock: "" };
const PIECES = ["panelLayout", "panelSizes", "handFanPos", "oppHandSpot", "spectatorNearFanPos", "spectatorFarFanPos", "promptPos", "promptDock"] as const;

describe("Reset layout", () => {
  it("is offered, and puts back, each moved piece of the layout including both spectator fans (#346) where pop-ups open (#422) and the column they dock into (#449)", () => {
    expect(layoutMoved(DEFAULT)).toBe(false);
    for (const key of PIECES) {
      const moved = { ...DEFAULT, [key]: key === "oppHandSpot" ? "left" : key === "promptPos" ? "-40,-200" : key === "promptDock" ? "right" : "0.4,0.5" };
      expect(layoutMoved(moved), key).toBe(true);
      expect(layoutMoved({ ...moved, ...LAYOUT_RESET }), key).toBe(false);
    }
  });
});
