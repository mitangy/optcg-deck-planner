import { describe, expect, it } from "vitest";
import { dockAnchor, sameAnchor, stripReserve } from "./dockAnchor";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("dockAnchor", () => {
  it("centres on the midline and sits at the mat's right edge, inset (#257)", () => {
    // Flat board: the strip overhangs the mat, so the mat's edge wins.
    const a = dockAnchor(box(100, 400, 800, 26), [box(110, 300, 700, 300)], 10);
    expect(a).toEqual({ x: 800, y: 413 });
  });

  it("follows a strip narrower than the mat, as on the tilted board (#257)", () => {
    const a = dockAnchor(box(200, 400, 500, 20), [box(110, 300, 900, 300)], 10);
    expect(a).toEqual({ x: 690, y: 410 });
  });

  it("has no anchor before the board is laid out (#257)", () => {
    expect(dockAnchor(null, [])).toBeNull();
    expect(dockAnchor(box(0, 0, 0, 0), [])).toBeNull();
  });

  it("keeps the battle strip clear of the dock where the strip runs past the mat (#__P1__)", () => {
    // 1280x720: the strip spans 238-990 but the dock hugs the mat edge at 879, 226 wide.
    // The strip's right side is covered from the dock's left edge (653) to 990, plus the gap.
    expect(stripReserve(box(238, 356, 752, 28), 879, 226, 12)).toBe(349);
  });

  it("reserves the dock's width plus the gap when the dock sits at the strip's right edge (#__P1__)", () => {
    expect(stripReserve(box(100, 400, 800, 26), 900, 200, 10)).toBe(210);
  });

  it("ignores sub-pixel jitter so the tracker does not re-render every frame (#257)", () => {
    expect(sameAnchor({ x: 10, y: 10 }, { x: 10.2, y: 9.9 })).toBe(true);
    expect(sameAnchor({ x: 10, y: 10 }, { x: 12, y: 10 })).toBe(false);
  });
});
