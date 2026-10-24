import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  detectCards,
  findCardQuads,
  inferGridCells,
  isBlankQuad,
  isCardShaped,
  splitBlock,
  type EdgeMap,
  quadIoU,
  sortReadingOrder,
  suppressNested,
  uprightQuad,
} from "./cardDetect";
import type { Cv } from "./cardMatch";
import type { Pt, Quad } from "./cardRectify";

const rect = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** A portrait card, 63:88. */
const card = (x: number, y: number, w = 126) => rect(x, y, w, Math.round((w * 88) / 63));

/** A flat or noisy ImageData, for the blank-pocket check. */
function flat(w: number, h: number, value: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = value(x, y);
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h, colorSpace: "srgb" } as unknown as ImageData;
}

describe("isCardShaped", () => {
  it("accepts a card in either orientation and rejects other boxes (#701)", () => {
    expect(isCardShaped(card(0, 0))).toBe(true);
    // Lying on its side: same card, long side across.
    expect(isCardShaped(rect(0, 0, 176, 126))).toBe(true);
    // Perspective squeezes the ratio a little; still a card.
    expect(isCardShaped(rect(0, 0, 80, 126))).toBe(true);
    // A long thin box, a square, and a wide landscape box are not cards.
    expect(isCardShaped(rect(0, 0, 40, 400))).toBe(false);
    expect(isCardShaped(rect(0, 0, 100, 100))).toBe(false);
    expect(isCardShaped(rect(0, 0, 300, 126))).toBe(false);
  });

  it("rejects a quad whose opposite sides disagree (#701)", () => {
    // Mean sides give a card-like ratio, but one side is twice the other.
    const kite: Quad = [
      { x: 0, y: 0 },
      { x: 126, y: 0 },
      { x: 126, y: 120 },
      { x: 0, y: 240 },
    ];
    expect(isCardShaped(kite)).toBe(false);
  });
});

describe("uprightQuad", () => {
  it("turns a sideways card so its long side runs top to bottom (#701)", () => {
    const sideways = rect(0, 0, 176, 126);
    const up = uprightQuad(sideways);
    expect(Math.hypot(up[3].x - up[0].x, up[3].y - up[0].y)).toBeCloseTo(176);
    expect(Math.hypot(up[1].x - up[0].x, up[1].y - up[0].y)).toBeCloseTo(126);
    const portrait = card(0, 0);
    expect(uprightQuad(portrait)).toEqual(portrait);
  });
});

describe("suppressNested", () => {
  it("keeps a card and drops the art box inside it (#701)", () => {
    const outer = card(100, 100, 200);
    const artBox = rect(120, 140, 160, 120);
    const kept = suppressNested([artBox, outer]);
    expect(kept).toEqual([outer]);
  });

  it("keeps two adjacent cards (#701)", () => {
    // Different sizes, so neither can pass for the other's duplicate.
    const a = card(100, 100);
    const b = card(232, 100, 104);
    expect(suppressNested([a, b])).toHaveLength(2);
  });

  it("drops a binder page that merely contains its cards (#701)", () => {
    const cards = [card(110, 110), card(250, 110), card(110, 300), card(250, 300)];
    const page = rect(90, 90, 300, 400);
    const kept = suppressNested([page, ...cards]);
    expect(kept).toHaveLength(4);
    expect(kept).not.toContain(page);
  });

  it("drops the page even when a detected row sits between it and the cards (#701)", () => {
    const cards = [card(110, 110), card(250, 110), card(110, 300), card(250, 300)];
    const row = rect(100, 100, 290, 190);
    const page = rect(90, 90, 300, 400);
    const kept = suppressNested([page, row, ...cards]);
    expect(kept).toHaveLength(4);
  });

  it("merges the same card found by two maps (#701)", () => {
    const a = card(100, 100);
    const b = card(103, 102);
    expect(suppressNested([a, b])).toHaveLength(1);
  });
});

describe("sortReadingOrder", () => {
  it("orders rows top to bottom, then left to right, despite jitter (#701)", () => {
    const tl = card(20, 22);
    const tr = card(200, 10);
    const bl = card(30, 300);
    const br = card(210, 312);
    expect(sortReadingOrder([br, tl, bl, tr])).toEqual([tl, tr, bl, br]);
  });
});

describe("inferGridCells", () => {
  const grid = (skip: number[] = []) => {
    const out: Quad[] = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (!skip.includes(r * 3 + c)) out.push(card(50 + c * 150, 50 + r * 200));
      }
    }
    return out;
  };

  it("fills a missing pocket of a 3x3 page (#701)", () => {
    const cells = inferGridCells(grid([4]));
    expect(cells).toHaveLength(1);
    expect(quadIoU(cells[0], card(200, 250))).toBeGreaterThan(0.9);
  });

  it("fills two missing pockets of a 4x3 page (#701)", () => {
    const page: Quad[] = [];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4; c += 1) page.push(card(50 + c * 150, 50 + r * 200));
    const cells = inferGridCells(page.filter((_, i) => i !== 1 && i !== 10));
    expect(cells).toHaveLength(2);
    expect(cells.some((q) => quadIoU(q, page[1]) > 0.9)).toBe(true);
    expect(cells.some((q) => quadIoU(q, page[10]) > 0.9)).toBe(true);
  });

  it("invents nothing when the page is complete (#701)", () => {
    expect(inferGridCells(grid())).toEqual([]);
  });

  it("invents nothing for cards scattered off any grid (#701)", () => {
    const loose = [card(40, 30), card(260, 90), card(120, 330), card(380, 280), card(30, 600)];
    expect(inferGridCells(loose)).toEqual([]);
  });

  it("invents nothing when cards sit on a lattice but fill few of its crossings (#701)", () => {
    const at = (r: number, c: number) => card(50 + c * 150, 50 + r * 200);
    const sparse = [at(0, 0), at(1, 1), at(2, 2), at(0, 3), at(2, 0)];
    expect(inferGridCells(sparse)).toEqual([]);
  });

  it("needs four cards to call it a grid (#701)", () => {
    expect(inferGridCells([card(50, 50), card(200, 50), card(50, 250)])).toEqual([]);
  });
});

/** A binary edge map with the given segments drawn one pixel thick. */
function edgeMap(w: number, h: number, segments: [Pt, Pt][]): EdgeMap {
  const data = new Uint8Array(w * h);
  for (const [a, b] of segments) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let i = 0; i <= n; i += 1) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / n);
      const y = Math.round(a.y + ((b.y - a.y) * i) / n);
      if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 255;
    }
  }
  return { data, width: w, height: h };
}
const outline = (q: Quad): [Pt, Pt][] => [0, 1, 2, 3].map((i) => [q[i], q[(i + 1) % 4]]);

describe("splitBlock", () => {
  const left = card(40, 40, 120);
  const right = card(160, 40, 120);
  const block = rect(40, 40, 240, 168);

  it("cuts two touching cards apart along the line between them (#701)", () => {
    const edges = edgeMap(320, 260, [...outline(left), ...outline(right)]);
    const cells = splitBlock(edges, block);
    expect(cells).toHaveLength(2);
    expect(quadIoU(cells![0], left)).toBeGreaterThan(0.9);
    expect(quadIoU(cells![1], right)).toBeGreaterThan(0.9);
  });

  it("leaves one sideways card whole, though it is as wide as two cards (#701)", () => {
    // Outline plus an art box: nothing runs down the middle.
    const edges = edgeMap(320, 260, [...outline(block), ...outline(rect(60, 60, 200, 80))]);
    expect(splitBlock(edges, block)).toBeNull();
  });

  it("does not split on a middle line when the artwork beside it is just as busy (#701)", () => {
    const busy: [Pt, Pt][] = [0.375, 0.5, 0.625].map((f) => [
      { x: 40 + 240 * f, y: 40 },
      { x: 40 + 240 * f, y: 208 },
    ]);
    const edges = edgeMap(320, 260, [...outline(block), ...busy]);
    expect(splitBlock(edges, block)).toBeNull();
  });

  it("cuts a row of three touching cards (#701)", () => {
    const row = rect(40, 40, 360, 168);
    const cards = [card(40, 40, 120), card(160, 40, 120), card(280, 40, 120)];
    const edges = edgeMap(440, 260, cards.flatMap(outline));
    expect(splitBlock(edges, row)).toHaveLength(3);
  });
});

describe("isBlankQuad", () => {
  const q = card(20, 20, 100);
  it("sees an empty pocket as blank and a printed card as not (#701)", () => {
    expect(isBlankQuad(flat(200, 260, () => 40), q)).toBe(true);
    expect(isBlankQuad(flat(200, 260, (x, y) => ((x >> 3) + (y >> 3)) % 2 ? 30 : 200), q)).toBe(false);
  });
});

/** Paint a printed-looking card: white edge, coloured body, an inner art box. */
function paintCard(img: ImageData, quad: Quad, hue: number) {
  const inside = (p: Pt, q: Quad) => {
    for (let i = 0; i < 4; i += 1) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0) return false;
    }
    return true;
  };
  const lerp = (u: number, v: number): Pt => ({
    x: (1 - v) * ((1 - u) * quad[0].x + u * quad[1].x) + v * ((1 - u) * quad[3].x + u * quad[2].x),
    y: (1 - v) * ((1 - u) * quad[0].y + u * quad[1].y) + v * ((1 - u) * quad[3].y + u * quad[2].y),
  });
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
      if (!inside({ x, y }, quad)) continue;
      // Find (u, v) by sampling is costly; invert approximately for near-affine quads.
      const dx = quad[1].x - quad[0].x;
      const dy = quad[1].y - quad[0].y;
      const ex = quad[3].x - quad[0].x;
      const ey = quad[3].y - quad[0].y;
      const det = dx * ey - dy * ex;
      const px = x - quad[0].x;
      const py = y - quad[0].y;
      const u = (px * ey - py * ex) / det;
      const v = (dx * py - dy * px) / det;
      const art = u > 0.1 && u < 0.9 && v > 0.12 && v < 0.42;
      const text = u > 0.1 && u < 0.9 && v > 0.62 && v < 0.9;
      const border = u < 0.05 || u > 0.95 || v < 0.03 || v > 0.97;
      const o = (y * img.width + x) * 4;
      const c = border
        ? [235, 235, 230]
        : art
          ? [(hue * 70) % 255, 120 + ((x * 7 + y * 3) % 60), (hue * 130 + ((x + y) % 40)) % 255]
          : text
            ? [60, 50 + hue * 8, 70]
            : [225, 222, 205];
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
    }
  }
  void lerp;
}

function scene(w: number, h: number, bg: number[], cards: Quad[]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  const img = { data, width: w, height: h, colorSpace: "srgb" } as unknown as ImageData;
  cards.forEach((q, i) => paintCard(img, q, i + 1));
  return img;
}

function rotated(cx: number, cy: number, w: number, h: number, deg: number): Quad {
  const r = (deg * Math.PI) / 180;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: cx + x * Math.cos(r) - y * Math.sin(r), y: cy + x * Math.sin(r) + y * Math.cos(r) })) as Quad;
}

/** Fraction of `truth` cards matched by a detection with IoU of at least 0.8. */
function recovered(found: Quad[], truth: Quad[]) {
  return truth.filter((t) => found.some((f) => quadIoU(f, t) > 0.8)).length;
}

/**
 * OpenCV for the tests. Loaded with require: vitest's dynamic import of this
 * CommonJS package yields a namespace with a `then`, which await mis-handles.
 */
let cvReady: Promise<{ cv: Cv }> | null = null;
function loadCv(): Promise<Cv> {
  cvReady ??= (async () => {
    const loaded = createRequire(import.meta.url)("@techstark/opencv-js");
    const mod = await Promise.resolve(loaded instanceof Promise ? loaded.then((m: Cv) => ({ cv: m })) : { cv: loaded });
    if (!mod.cv.Mat) await new Promise<void>((resolve) => { mod.cv.onRuntimeInitialized = () => resolve(); });
    return mod;
  })();
  return cvReady.then((m) => m.cv);
}

describe("findCardQuads (OpenCV)", () => {
  it("finds all nine cards on a binder page (#701)", async () => {
    const cv = await loadCv();
    const truth: Quad[] = [];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) truth.push(card(60 + c * 150, 60 + r * 200, 126));
    // A dark sheet behind them, as in a real binder page.
    const img = scene(560, 700, [30, 32, 48], truth);
    const found = findCardQuads(cv, img, { fallback: false, fillGrid: false });
    expect(found).toHaveLength(9);
    expect(recovered(found, truth)).toBe(9);
    // Reading order: top row first, left to right.
    expect(found[0].every((p) => p.y < 260)).toBe(true);
    expect(found[1][0].x).toBeGreaterThan(found[0][0].x);
  }, 30000);

  it("finds tilted and sideways cards on a table, in portrait corner order (#701)", async () => {
    const cv = await loadCv();
    const truth = [
      rotated(150, 170, 126, 176, 20),
      rotated(420, 150, 126, 176, -15),
      rotated(160, 440, 126, 176, 90),
      rotated(430, 440, 126, 176, 4),
    ];
    const img = scene(600, 600, [150, 110, 70], truth);
    const found = findCardQuads(cv, img, { fallback: false, fillGrid: false });
    expect(found).toHaveLength(4);
    // Orientation of the corners may be any of the four; compare shapes by IoU.
    expect(recovered(found, truth)).toBe(4);
    for (const q of found) {
      const across = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
      const down = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
      expect(down).toBeGreaterThan(across);
    }
  }, 30000);

  it("cuts two touching cards apart and remembers the block they came from (#701)", async () => {
    const cv = await loadCv();
    const truth = [card(80, 100, 126), card(208, 100, 126)];
    const img = scene(420, 380, [150, 110, 70], truth);
    const cards = detectCards(cv, img, { fallback: false, fillGrid: false });
    expect(cards).toHaveLength(2);
    expect(recovered(cards.map((c) => c.quad), truth)).toBe(2);
    expect(cards[0].whole).toBeDefined();
    expect(cards[1].whole).toBe(cards[0].whole);
  }, 30000);

  it("falls back to the whole frame when nothing card-like is there (#701)", async () => {
    const cv = await loadCv();
    const img = scene(300, 300, [120, 120, 120], []);
    const found = findCardQuads(cv, img);
    expect(found).toHaveLength(1);
    expect(found[0].some((p) => p.x > 250)).toBe(true);
  }, 30000);
});
