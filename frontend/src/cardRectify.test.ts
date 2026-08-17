import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  findCardQuad,
  orderCorners,
  quadArea,
  regionToBox,
  type Quad,
} from "./cardRectify";

const unit: Quad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

/** Build an ImageData with a filled quad over a flat background. */
function scene(w: number, h: number, corners: Quad, fg = [30, 30, 200], bg = [240, 240, 240]) {
  const data = new Uint8ClampedArray(w * h * 4);
  const inside = (px: number, py: number) => {
    // Even-odd test against the polygon edges.
    let hit = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = corners[i];
      const b = corners[j];
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const c = inside(x, y) ? fg : bg;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h, colorSpace: "srgb" } as unknown as ImageData;
}

describe("computeHomography", () => {
  it("recovers an identity mapping", () => {
    const h = computeHomography(unit, unit);
    expect(h).not.toBeNull();
    const p = applyHomography(h!, { x: 37, y: 91 });
    expect(p.x).toBeCloseTo(37, 6);
    expect(p.y).toBeCloseTo(91, 6);
  });

  it("maps every corner onto its target", () => {
    const skewed: Quad = [
      { x: 12, y: 5 },
      { x: 190, y: 30 },
      { x: 170, y: 260 },
      { x: 4, y: 240 },
    ];
    const h = computeHomography(unit, skewed)!;
    for (let i = 0; i < 4; i += 1) {
      const got = applyHomography(h, unit[i]);
      expect(got.x).toBeCloseTo(skewed[i].x, 4);
      expect(got.y).toBeCloseTo(skewed[i].y, 4);
    }
  });

  it("returns null for a degenerate quad", () => {
    const collapsed: Quad = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(computeHomography(collapsed, unit)).toBeNull();
  });
});

describe("orderCorners", () => {
  it("sorts shuffled corners into TL, TR, BR, BL", () => {
    const shuffled = [
      { x: 100, y: 200 },
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 100, y: 0 },
    ];
    expect(orderCorners(shuffled)).toEqual(unit);
  });

  it("rejects the wrong number of points", () => {
    expect(orderCorners([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("quadArea", () => {
  it("measures an axis-aligned rectangle", () => {
    expect(quadArea(unit)).toBe(100 * 200);
  });
});

describe("findCardQuad", () => {
  it("locates an upright card against a plain background", () => {
    const card: Quad = [
      { x: 30, y: 20 },
      { x: 130, y: 20 },
      { x: 130, y: 160 },
      { x: 30, y: 160 },
    ];
    const quad = findCardQuad(scene(200, 200, card));
    expect(quad).not.toBeNull();
    // Corners land within a pixel or two of truth.
    for (let i = 0; i < 4; i += 1) {
      expect(Math.abs(quad![i].x - card[i].x)).toBeLessThanOrEqual(2);
      expect(Math.abs(quad![i].y - card[i].y)).toBeLessThanOrEqual(2);
    }
  });

  it("locates a rotated card", () => {
    const card: Quad = [
      { x: 44, y: 22 },
      { x: 142, y: 40 },
      { x: 120, y: 176 },
      { x: 24, y: 158 },
    ];
    const quad = findCardQuad(scene(200, 200, card));
    expect(quad).not.toBeNull();
    for (let i = 0; i < 4; i += 1) {
      expect(Math.abs(quad![i].x - card[i].x)).toBeLessThanOrEqual(4);
      expect(Math.abs(quad![i].y - card[i].y)).toBeLessThanOrEqual(4);
    }
  });

  it("returns null when nothing card-shaped is present", () => {
    // A tiny blob is not a card.
    const speck: Quad = [
      { x: 90, y: 90 },
      { x: 100, y: 90 },
      { x: 100, y: 104 },
      { x: 90, y: 104 },
    ];
    expect(findCardQuad(scene(200, 200, speck))).toBeNull();
  });

  it("accepts a shape that is not card-proportioned", () => {
    // Deliberately not rejected on aspect: without a capture guide, a real
    // handheld photo's projected quad can take almost any aspect under
    // perspective, so a card-shape test has no reliable signal to key off —
    // measured on real photos, it rejected a genuinely correct detection
    // while a wrong one passed. Correctness instead comes from the caller,
    // which retries whole-image OCR whenever the rectified crop yields no
    // card id, so a wrong-shaped accept here costs a wasted pass, not a
    // wrong answer.
    const wide: Quad = [
      { x: 10, y: 80 },
      { x: 190, y: 80 },
      { x: 190, y: 120 },
      { x: 10, y: 120 },
    ];
    expect(findCardQuad(scene(200, 200, wide))).not.toBeNull();
  });
});

describe("regionToBox", () => {
  it("converts fractions to pixels on the rectified card", () => {
    const box = regionToBox({ x: 0.5, y: 0.9, w: 0.25, h: 0.05 }, 800, 1000);
    expect(box).toEqual({ x0: 400, y0: 900, x1: 600, y1: 950 });
  });
});
