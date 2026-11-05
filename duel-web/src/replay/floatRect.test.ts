import { afterEach, describe, expect, it, vi } from "vitest";
import { clampRect, defaultRect, keyMove, keyResize, moveRect, PANEL_GAP, PANEL_MAX_W, PANEL_MIN, readRect, REVIEW_RECT_KEY, resizeRect, writeRect, type Rect } from "./floatRect";

const vp = { w: 1280, h: 720 };
const limits = { vp, top: 60 };
const box: Rect = { x: 400, y: 200, w: 360, h: 300 };

afterEach(() => vi.unstubAllGlobals());

function store(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal("localStorage", { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] });
  return data;
}

describe("clampRect (#986)", () => {
  it("keeps the whole panel on screen, below the top bar, with a gap to the edges", () => {
    expect(clampRect({ ...box, x: -300, y: 0 }, limits)).toMatchObject({ x: PANEL_GAP, y: 60 });
    expect(clampRect({ ...box, x: 5000, y: 5000 }, limits)).toMatchObject({ x: 1280 - PANEL_GAP - 360, y: 720 - PANEL_GAP - 300 });
    expect(clampRect(box, limits)).toEqual(box);
  });

  it("holds the size between the minimum and the maximum width, and within the window", () => {
    expect(clampRect({ ...box, w: 10, h: 10 }, limits)).toMatchObject({ w: PANEL_MIN.w, h: PANEL_MIN.h });
    expect(clampRect({ ...box, w: 5000 }, limits).w).toBe(PANEL_MAX_W);
    // A window shorter than the panel shrinks it (the room wins over its old height), and it still fits whole.
    const small = clampRect({ x: 0, y: 0, w: 360, h: 600 }, { vp: { w: 1280, h: 500 }, top: 60 });
    expect(small.h).toBe(500 - PANEL_GAP - 60);
    expect(small.y + small.h).toBeLessThanOrEqual(500 - PANEL_GAP);
  });
});

describe("moveRect (#986)", () => {
  it("follows the pointer and stops at the viewport edges", () => {
    expect(moveRect(box, 30, -20, limits)).toMatchObject({ x: 430, y: 180, w: 360, h: 300 });
    expect(moveRect(box, 9999, 9999, limits)).toMatchObject({ x: 1280 - PANEL_GAP - 360, y: 720 - PANEL_GAP - 300 });
  });
});

describe("resizeRect (#986)", () => {
  it("the right and bottom edges grow the box and leave the top-left corner", () => {
    expect(resizeRect(box, "right", 50, 999, limits)).toEqual({ ...box, w: 410 });
    expect(resizeRect(box, "bottom", 999, 40, limits)).toEqual({ ...box, h: 340 });
  });

  it("the left and top edges move the corner and keep the opposite edge, also when the minimum or the window stops them", () => {
    expect(resizeRect(box, "left", -60, 0, limits)).toEqual({ ...box, x: 340, w: 420 });
    expect(resizeRect(box, "top", 0, -50, limits)).toEqual({ ...box, y: 150, h: 350 });
    // Dragged far to the right: it stops at the minimum width and the right edge (760) has not moved.
    const narrow = resizeRect(box, "left", 900, 0, limits);
    expect(narrow.w).toBe(PANEL_MIN.w);
    expect(narrow.x + narrow.w).toBe(760);
    // Dragged far to the left: it stops at the viewport gap, the right edge still at 760.
    const wide = resizeRect({ ...box, x: 300, w: 460 }, "left", -9999, 0, limits);
    expect(wide.x).toBeGreaterThanOrEqual(PANEL_GAP);
    expect(wide.x + wide.w).toBe(760);
    const short = resizeRect(box, "top", 0, 900, limits);
    expect(short.h).toBe(PANEL_MIN.h);
    expect(short.y + short.h).toBe(500);
  });

  it("a corner resizes both ways", () => {
    expect(resizeRect(box, "bottom-right", 20, 30, limits)).toEqual({ ...box, w: 380, h: 330 });
    expect(resizeRect(box, "top-left", -20, -30, limits)).toEqual({ x: 380, y: 170, w: 380, h: 330 });
  });

  it("never grows wider than the maximum or past the right edge", () => {
    expect(resizeRect(box, "right", 9999, 0, limits).w).toBe(PANEL_MAX_W);
    const near = resizeRect({ ...box, x: 1000, w: 260 }, "right", 9999, 0, limits);
    // Stopped at the window edge: the left edge stays where it was (it is not pushed over to make room).
    expect(near).toMatchObject({ x: 1000, w: 1280 - PANEL_GAP - 1000 });
  });
});

describe("keyboard (#986)", () => {
  it("arrows move the panel the way they point, and Shift takes a big step", () => {
    expect(keyMove(box, "ArrowLeft", false, limits)).toMatchObject({ x: 384, y: 200 });
    expect(keyMove(box, "ArrowDown", true, limits)).toMatchObject({ x: 400, y: 264 });
    expect(keyMove(box, "Enter", false, limits)).toBeNull();
  });

  it("an edge handle's arrows move that edge, and keys across a side edge's axis do nothing", () => {
    expect(keyResize(box, "right", "ArrowRight", false, limits)).toEqual({ ...box, w: 376 });
    expect(keyResize(box, "left", "ArrowLeft", false, limits)).toEqual({ ...box, x: 384, w: 376 });
    expect(keyResize(box, "bottom", "ArrowUp", false, limits)).toEqual({ ...box, h: 284 });
    expect(keyResize(box, "bottom", "ArrowLeft", false, limits)).toBeNull();
    expect(keyResize(box, "left", "ArrowDown", false, limits)).toBeNull();
  });
});

describe("defaultRect (#986)", () => {
  it("opens above the anchor, right-aligned with it", () => {
    const r = defaultRect({ top: 680, left: 980, right: 1268 }, { w: 360, h: 400 }, limits);
    expect(r).toEqual({ x: 908, y: 272, w: 360, h: 400 });
  });

  it("is only as tall as the room above the anchor", () => {
    const r = defaultRect({ top: 500, left: 980, right: 1268 }, { w: 360, h: 900 }, limits);
    expect(r.y).toBe(60);
    expect(r.y + r.h).toBe(500 - PANEL_GAP);
  });

  it("opens beside the anchor, full height, when there is too little room above it", () => {
    const r = defaultRect({ top: 380, left: 980, right: 1268 }, { w: 360, h: 900 }, limits);
    expect(r).toEqual({ x: 980 - PANEL_GAP - 360, y: 60, w: 360, h: 720 - PANEL_GAP - 60 });
  });
});

describe("remembering the box (#986)", () => {
  it("reads back what was written", () => {
    store();
    writeRect(box);
    expect(readRect()).toEqual(box);
    writeRect(null);
    expect(readRect()).toBeNull();
  });

  it("ignores what is not a box", () => {
    for (const bad of ["not json", "null", '{"x":1,"y":2,"w":3}', '{"x":"1","y":2,"w":3,"h":4}', '{"x":null,"y":2,"w":3,"h":4}']) {
      store({ [REVIEW_RECT_KEY]: bad });
      expect(readRect()).toBeNull();
    }
  });

  it("works when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readRect()).toBeNull();
    expect(() => writeRect(box)).not.toThrow();
    expect(() => writeRect(null)).not.toThrow();
  });
});
