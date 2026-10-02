import { describe, expect, it } from "vitest";
import { dockAnchor, sameAnchor } from "./dockAnchor";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("dockAnchor", () => {
  it("centres on the midline and sits at the mat's right edge, inset (#PR_G)", () => {
    // Flat board: the strip overhangs the mat, so the mat's edge wins.
    const a = dockAnchor(box(100, 400, 800, 26), [box(110, 300, 700, 300)], 10);
    expect(a).toEqual({ x: 800, y: 413 });
  });

  it("follows a strip narrower than the mat, as on the tilted board (#PR_G)", () => {
    const a = dockAnchor(box(200, 400, 500, 20), [box(110, 300, 900, 300)], 10);
    expect(a).toEqual({ x: 690, y: 410 });
  });

  it("has no anchor before the board is laid out (#PR_G)", () => {
    expect(dockAnchor(null, [])).toBeNull();
    expect(dockAnchor(box(0, 0, 0, 0), [])).toBeNull();
  });

  it("ignores sub-pixel jitter so the tracker does not re-render every frame (#PR_G)", () => {
    expect(sameAnchor({ x: 10, y: 10 }, { x: 10.2, y: 9.9 })).toBe(true);
    expect(sameAnchor({ x: 10, y: 10 }, { x: 12, y: 10 })).toBe(false);
  });
});
