import { describe, expect, it } from "vitest";
import { unproject } from "./BoardMotion";

// perspective(900px) rotateX(30deg), as DOMMatrix fields: the tilted board's transform.
const deg = Math.PI / 6;
const m = {
  m11: 1,
  m12: 0,
  m14: 0,
  m21: 0,
  m22: Math.cos(deg),
  m24: -Math.sin(deg) / 900,
  m41: 0,
  m42: 0,
  m44: 1,
};

/** Where `m` draws the board point (x, y, 0), relative to the pivot. */
function project(x: number, y: number): [number, number] {
  const w = m.m14 * x + m.m24 * y + m.m44;
  return [(m.m11 * x + m.m21 * y + m.m41) / w, (m.m12 * x + m.m22 * y + m.m42) / w];
}

describe("unproject", () => {
  it("finds the board point a screen point shows, far back and off-centre", () => {
    // A card high on the opponent's mat, left of centre: shrunk and foreshortened on screen.
    const [sx, sy] = project(-240, -520);
    const p = unproject(m, sx, sy);
    expect(p?.x).toBeCloseTo(-240, 6);
    expect(p?.y).toBeCloseTo(-520, 6);
  });
});
