import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clampSheet, clampSize, dragSheet, dragSize, keySize, maxSize, readSheet, readSize, SHEET_KEY, SIZE_KEY, writeSheet, writeSize } from "./panelSize";

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

  it("grows up and left when the top or left edge is dragged that way, keeping the other side (#390)", () => {
    const start = { w: 420, h: 600 };
    expect(dragSize(start, "top", -999, -100, vp)).toEqual({ w: 420, h: 700 });
    expect(dragSize(start, "left", -150, -999, vp)).toEqual({ w: 570, h: 600 });
    expect(dragSize(start, "corner", -50, -60, vp)).toEqual({ w: 470, h: 660 });
    expect(dragSize(start, "corner", 500, 500, vp)).toEqual({ w: 320, h: 360 });
    expect(dragSize(start, "top", 0, -9999, vp).h).toBe(784);
  });

  it("moves a handle with the arrow keys, 16px at a time or 64px with Shift, only along its own axis (#390)", () => {
    const start = { w: 420, h: 600 };
    expect(keySize(start, "top", "ArrowUp", false, vp)).toEqual({ w: 420, h: 616 });
    expect(keySize(start, "top", "ArrowDown", true, vp)).toEqual({ w: 420, h: 536 });
    expect(keySize(start, "top", "ArrowLeft", false, vp)).toBeNull();
    expect(keySize(start, "left", "ArrowLeft", false, vp)).toEqual({ w: 436, h: 600 });
    expect(keySize(start, "left", "ArrowRight", false, vp)).toEqual({ w: 404, h: 600 });
    expect(keySize(start, "left", "ArrowUp", false, vp)).toBeNull();
    expect(keySize(start, "corner", "ArrowUp", false, vp)).toEqual({ w: 420, h: 616 });
    expect(keySize(start, "corner", "ArrowLeft", false, vp)).toEqual({ w: 436, h: 600 });
    expect(keySize(start, "top", "Enter", false, vp)).toBeNull();
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
