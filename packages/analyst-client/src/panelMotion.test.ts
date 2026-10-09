import { describe, expect, it } from "vitest";
import { compassRect, growOrigin, popFrames, slideFrames } from "./panelMotion";

describe("the panel's pop out of the compass (#432)", () => {
  it("scales from the compass centre, measured from the panel's top-left corner (#432)", () => {
    const compass = { left: 1000, top: 700, width: 52, height: 52 };
    // A drawer on the right edge: the compass is inside it, near the bottom-right.
    expect(growOrigin(compass, { left: 780, top: 0, width: 420, height: 720 })).toEqual({ x: 246, y: 726 });
    // A window moved to the left: the compass is outside it, so the origin lies beyond its edge.
    expect(growOrigin(compass, { left: 100, top: 50, width: 420, height: 600 })).toEqual({ x: 926, y: 676 });
  });

  it("finds the compass in the bottom-right corner, 16px in, 52px across (#432)", () => {
    expect(compassRect({ w: 1280, h: 720 })).toEqual({ left: 1212, top: 652, width: 52, height: 52 });
  });

  it("grows from a small, transparent panel and shrinks back into one (#432)", () => {
    const open = popFrames(true);
    const close = popFrames(false);
    expect(open[0]).toMatchObject({ opacity: 0 });
    expect(open[1]).toMatchObject({ opacity: 1, transform: "scale(1)" });
    expect(close).toEqual([...open].reverse());
  });

  it("slides a docked panel in from its own edge (#432)", () => {
    expect(slideFrames("right", true)[0]!.transform).toBe("translateX(28px)");
    expect(slideFrames("left", true)[0]!.transform).toBe("translateX(-28px)");
    expect(slideFrames("right", false)).toEqual([...slideFrames("right", true)].reverse());
  });
});
