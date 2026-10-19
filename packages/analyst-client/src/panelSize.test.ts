import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clampSheet, clampSize, dragRect, dragSheet, keyRect, maxSize, readSheet, readSize, SHEET_KEY, SIZE_KEY, writeSheet, writeSize } from "./panelSize";

const vp = { w: 1200, h: 800 };

describe("panel size (#390)", () => {
  it("never goes below 320x360 or past the viewport less the margin (#390)", () => {
    expect(clampSize({ w: 100, h: 100 }, vp)).toEqual({ w: 320, h: 360 });
    expect(clampSize({ w: 5000, h: 5000 }, vp)).toEqual({ w: 1184, h: 784 });
    expect(clampSize({ w: 500, h: 500 }, vp)).toEqual({ w: 500, h: 500 });
    expect(maxSize(vp)).toEqual({ w: 1184, h: 784 });
  });

  it("lets the minimum give way when the viewport is smaller than it (#390)", () => {
    expect(clampSize({ w: 400, h: 400 }, { w: 300, h: 375 })).toEqual({ w: 284, h: 359 });
  });

  const at = (w: number, h: number, r = 100, b = 50) => ({ size: { w, h }, pos: { r, b } });

  it("grows up and left when the top or left edge is dragged that way, keeping the right and bottom edges (#390, #532)", () => {
    const start = at(420, 600);
    expect(dragRect(start, "top", -999, -100, vp)).toEqual(at(420, 700));
    expect(dragRect(start, "left", -150, -999, vp)).toEqual(at(570, 600));
    expect(dragRect(start, "top-left", -50, -60, vp)).toEqual(at(470, 660));
    expect(dragRect(start, "top-left", 500, 500, vp)).toEqual(at(320, 360));
    expect(dragRect(start, "top", 0, -9999, vp).size.h).toBe(800 - 50 - 16);
  });

  it("dragging the right edge keeps the left edge: the gap to the right shrinks by what the width gains (#532)", () => {
    expect(dragRect(at(420, 600), "right", 80, 999, vp)).toEqual(at(500, 600, 20));
    expect(dragRect(at(420, 600), "right", -60, 0, vp)).toEqual(at(360, 600, 160));
  });

  it("dragging the bottom edge keeps the top edge: the gap to the bottom shrinks by what the height gains (#532)", () => {
    expect(dragRect(at(420, 600), "bottom", 999, 30, vp)).toEqual(at(420, 630, 100, 20));
    expect(dragRect(at(420, 600), "bottom", 0, -100, vp)).toEqual(at(420, 500, 100, 150));
  });

  it("dragging the bottom-right corner moves only that corner, and the top-right and bottom-left ones each move theirs (#532)", () => {
    expect(dragRect(at(420, 600), "bottom-right", 80, 40, vp)).toEqual(at(500, 640, 20, 10));
    expect(dragRect(at(420, 600), "top-right", 80, -40, vp)).toEqual(at(500, 640, 20, 50));
    expect(dragRect(at(420, 600), "bottom-left", -30, 20, vp)).toEqual(at(450, 620, 100, 30));
  });

  it("stops a right or bottom edge at the viewport edge and at the minimum without moving the opposite edge (#532)", () => {
    // Left edge at 1200 - 100 - 420 = 680: it can't be pulled past the right edge of the window...
    expect(dragRect(at(420, 600), "right", 5000, 0, vp)).toEqual(at(520, 600, 0));
    expect(dragRect(at(420, 600), "bottom", 0, 5000, vp)).toEqual(at(420, 650, 100, 0));
    // ...and pushing it back past the minimum leaves the left/top edge exactly where it was.
    const small = dragRect(at(420, 600), "bottom-right", -5000, -5000, vp);
    expect(small).toEqual(at(320, 360, 200, 290));
    expect(vp.w - small.pos.r - small.size.w).toBe(vp.w - 100 - 420);
    expect(vp.h - small.pos.b - small.size.h).toBe(vp.h - 50 - 600);
  });

  it("moves a handle with the arrow keys, 16px at a time or 64px with Shift, the way the edge points, only along its own axis (#390, #532)", () => {
    const start = at(420, 600);
    expect(keyRect(start, "top", "ArrowUp", false, vp)).toEqual(at(420, 616));
    expect(keyRect(start, "top", "ArrowDown", true, vp)).toEqual(at(420, 536));
    expect(keyRect(start, "top", "ArrowLeft", false, vp)).toBeNull();
    expect(keyRect(start, "left", "ArrowLeft", false, vp)).toEqual(at(436, 600));
    expect(keyRect(start, "left", "ArrowRight", false, vp)).toEqual(at(404, 600));
    expect(keyRect(start, "left", "ArrowUp", false, vp)).toBeNull();
    expect(keyRect(start, "right", "ArrowRight", false, vp)).toEqual(at(436, 600, 84));
    expect(keyRect(start, "right", "ArrowLeft", true, vp)).toEqual(at(356, 600, 164));
    expect(keyRect(start, "right", "ArrowDown", false, vp)).toBeNull();
    expect(keyRect(start, "bottom", "ArrowDown", false, vp)).toEqual(at(420, 616, 100, 34));
    expect(keyRect(start, "bottom", "ArrowUp", false, vp)).toEqual(at(420, 584, 100, 66));
    expect(keyRect(start, "top-left", "ArrowUp", false, vp)).toEqual(at(420, 616));
    expect(keyRect(start, "top-left", "ArrowLeft", false, vp)).toEqual(at(436, 600));
    expect(keyRect(start, "bottom-right", "ArrowRight", false, vp)).toEqual(at(436, 600, 84));
    expect(keyRect(start, "top", "Enter", false, vp)).toBeNull();
  });
});

describe("remembered size (#390)", () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("remembers a size, forgets it on reset, and ignores junk (#390)", () => {
    expect(readSize()).toBeNull();
    writeSize({ w: 500, h: 600 });
    expect(JSON.parse(store.get(SIZE_KEY)!)).toEqual({ w: 500, h: 600 });
    expect(readSize()).toEqual({ w: 500, h: 600 });
    writeSize(null);
    expect(readSize()).toBeNull();
    store.set(SIZE_KEY, "not json");
    expect(readSize()).toBeNull();
    store.set(SIZE_KEY, '{"w":"x","h":3}');
    expect(readSize()).toBeNull();
  });

  it("works when storage throws (#390)", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readSize()).toBeNull();
    expect(readSheet()).toBe(1);
    expect(() => writeSize({ w: 1, h: 1 })).not.toThrow();
    expect(() => writeSheet(0.6)).not.toThrow();
  });

  it("remembers the phone sheet's height as a share of the screen and treats full height as nothing to remember (#390)", () => {
    expect(readSheet()).toBe(1);
    writeSheet(0.6);
    expect(store.get(SHEET_KEY)).toBe("0.6");
    expect(readSheet()).toBe(0.6);
    store.set(SHEET_KEY, "0.1");
    expect(readSheet()).toBe(0.45);
    writeSheet(1);
    expect(store.has(SHEET_KEY)).toBe(false);
    store.set(SHEET_KEY, "abc");
    expect(readSheet()).toBe(1);
  });
});

describe("phone sheet height (#390)", () => {
  it("stays between 45% of the screen and full height, snapping to full near the top (#390)", () => {
    expect(clampSheet(0.2)).toBe(0.45);
    expect(clampSheet(1.4)).toBe(1);
    expect(clampSheet(0.7)).toBe(0.7);
    expect(clampSheet(0.95)).toBe(0.95);
    expect(clampSheet(0.95, true)).toBe(1);
    expect(clampSheet(0.9, true)).toBe(0.9);
    expect(clampSheet(NaN)).toBe(1);
  });

  it("gets taller as the grab handle is dragged up and shorter as it is dragged down (#390)", () => {
    expect(dragSheet(0.6, 400, 300, 800)).toBeCloseTo(0.725);
    expect(dragSheet(0.6, 400, 500, 800)).toBeCloseTo(0.475);
    expect(dragSheet(0.6, 400, 700, 800)).toBe(0.45);
    expect(dragSheet(0.6, 400, 0, 800)).toBe(1);
    expect(dragSheet(0.6, 400, 300, 0)).toBe(1);
  });
});
