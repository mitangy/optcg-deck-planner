import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clampPos, dragPos, keyPos, POS_KEY, readPos, roomAt, writePos } from "./panelPos";

const vp = { w: 1200, h: 800 };
const size = { w: 420, h: 600 };

describe("panel position (#423)", () => {
  it("keeps the whole window on screen, whatever the stored gap is (#423)", () => {
    expect(clampPos({ r: -50, b: -50 }, size, vp)).toEqual({ r: 0, b: 0 });
    expect(clampPos({ r: 9999, b: 9999 }, size, vp)).toEqual({ r: 780, b: 200 });
    expect(clampPos({ r: 100, b: 40 }, size, vp)).toEqual({ r: 100, b: 40 });
  });

  it("pins a window as big as the screen in the corner (#423)", () => {
    expect(clampPos({ r: 300, b: 300 }, { w: 1200, h: 800 }, vp)).toEqual({ r: 0, b: 0 });
    expect(clampPos({ r: 300, b: 300 }, { w: 2000, h: 2000 }, vp)).toEqual({ r: 0, b: 0 });
  });

  it("rounds to whole pixels (#423)", () => {
    expect(clampPos({ r: 10.6, b: 20.4 }, size, vp)).toEqual({ r: 11, b: 20 });
  });

  it("follows the pointer: right and down shrink the gap to that edge, left and up grow it (#423)", () => {
    const start = { r: 100, b: 100 };
    expect(dragPos(start, 30, 20, size, vp)).toEqual({ r: 70, b: 80 });
    expect(dragPos(start, -30, -20, size, vp)).toEqual({ r: 130, b: 120 });
  });

  it("stops dragging at every edge of the screen (#423)", () => {
    const start = { r: 100, b: 100 };
    expect(dragPos(start, 5000, 5000, size, vp)).toEqual({ r: 0, b: 0 });
    expect(dragPos(start, -5000, -5000, size, vp)).toEqual({ r: 780, b: 200 });
  });

  it("moves 16px per arrow key and 64px with Shift, the way the arrow points, and ignores other keys (#423)", () => {
    const start = { r: 100, b: 100 };
    expect(keyPos(start, "ArrowLeft", false, size, vp)).toEqual({ r: 116, b: 100 });
    expect(keyPos(start, "ArrowRight", false, size, vp)).toEqual({ r: 84, b: 100 });
    expect(keyPos(start, "ArrowUp", true, size, vp)).toEqual({ r: 100, b: 164 });
    expect(keyPos(start, "ArrowDown", true, size, vp)).toEqual({ r: 100, b: 36 });
    expect(keyPos(start, "Enter", false, size, vp)).toBeNull();
    expect(keyPos({ r: 0, b: 0 }, "ArrowRight", false, size, vp)).toEqual({ r: 0, b: 0 });
  });

  it("leaves a window at a position only the room between it and the far edges to grow into (#423)", () => {
    expect(roomAt(vp, { r: 100, b: 50 })).toEqual({ w: 1100, h: 750 });
    expect(roomAt(vp, null)).toEqual(vp);
    expect(roomAt({ w: 100, h: 100 }, { r: 500, b: 500 })).toEqual({ w: 0, h: 0 });
  });

  describe("remembered position", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
      });
    });
    afterEach(() => {
      Reflect.deleteProperty(globalThis, "localStorage");
    });

    it("stores the gap as the player left it, unclamped, and forgets it on reset (#423)", () => {
      expect(readPos()).toBeNull();
      writePos({ r: 5000, b: 7 });
      expect(JSON.parse(store.get(POS_KEY)!)).toEqual({ r: 5000, b: 7 });
      expect(readPos()).toEqual({ r: 5000, b: 7 });
      writePos(null);
      expect(store.has(POS_KEY)).toBe(false);
      expect(readPos()).toBeNull();
    });

    it("reads nothing from garbage (#423)", () => {
      for (const raw of ["not json", "null", "[]", '{"r":"1","b":2}', '{"r":1}', '{"r":null,"b":2}']) {
        store.set(POS_KEY, raw);
        expect(readPos(), raw).toBeNull();
      }
    });

    it("works when storage throws (#423)", () => {
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
      expect(readPos()).toBeNull();
      expect(() => writePos({ r: 1, b: 1 })).not.toThrow();
      expect(() => writePos(null)).not.toThrow();
    });
  });
});
