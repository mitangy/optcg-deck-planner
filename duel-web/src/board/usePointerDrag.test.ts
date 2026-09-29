import { describe, expect, it } from "vitest";
import { decideDragStart } from "./usePointerDrag";

describe("decideDragStart", () => {
  it("waits until the movement threshold", () => {
    expect(decideDragStart({ dx: 3, dy: 3, pointerType: "mouse", panAxis: "none" })).toBe(
      "wait",
    );
  });

  it("mouse drags start in any direction (desktop rail → board is horizontal)", () => {
    expect(decideDragStart({ dx: -60, dy: 4, pointerType: "mouse", panAxis: "none" })).toBe(
      "start",
    );
    // Even if a (mis)detected pan axis is passed, mouse never pans by dragging.
    expect(decideDragStart({ dx: -60, dy: 4, pointerType: "mouse", panAxis: "x" })).toBe(
      "start",
    );
  });

  it("touch on a horizontally scrolling hand yields sideways pans to scrolling", () => {
    expect(decideDragStart({ dx: 30, dy: 5, pointerType: "touch", panAxis: "x" })).toBe(
      "cancel",
    );
    expect(decideDragStart({ dx: 5, dy: -30, pointerType: "touch", panAxis: "x" })).toBe(
      "start",
    );
  });

  it("touch on a vertically scrolling rail yields vertical pans to scrolling", () => {
    expect(decideDragStart({ dx: 4, dy: 30, pointerType: "touch", panAxis: "y" })).toBe(
      "cancel",
    );
    expect(decideDragStart({ dx: -40, dy: 6, pointerType: "touch", panAxis: "y" })).toBe(
      "start",
    );
  });

  it("touch with no scroll container drags in any direction", () => {
    expect(decideDragStart({ dx: 40, dy: 0, pointerType: "touch", panAxis: "none" })).toBe(
      "start",
    );
  });
});
