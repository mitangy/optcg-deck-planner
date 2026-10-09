import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampDockW,
  DOCK_KEY,
  DOCK_W_KEY,
  dockAt,
  dragDockW,
  floatBeside,
  floatSize,
  keyDock,
  looseAt,
  pulledLoose,
  readDock,
  readDockW,
  writeDock,
  writeDockW,
} from "./panelDock";

const vp = { w: 1200, h: 800 };

describe("docking the Log Pose window (#432)", () => {
  it("docks to a side when the pointer is within 24px of that screen edge, and not before (#432)", () => {
    expect(dockAt(0, 1200)).toBe("left");
    expect(dockAt(24, 1200)).toBe("left");
    expect(dockAt(25, 1200)).toBeNull();
    expect(dockAt(600, 1200)).toBeNull();
    expect(dockAt(1175, 1200)).toBeNull();
    expect(dockAt(1176, 1200)).toBe("right");
    expect(dockAt(1200, 1200)).toBe("right");
  });

  it("docks into a game's column when the pointer is over it, wherever that is on screen (#432)", () => {
    const columns = { left: { left: 0, right: 260 }, right: { left: 900, right: 1200 } };
    expect(dockAt(200, 1200, columns)).toBe("left");
    expect(dockAt(950, 1200, columns)).toBe("right");
    expect(dockAt(600, 1200, columns)).toBeNull();
    expect(dockAt(200, 1200)).toBeNull();
  });

  it("lets go of a docked panel only after the header is dragged 32px (#432)", () => {
    expect(pulledLoose(0, 0)).toBe(false);
    expect(pulledLoose(31, 0)).toBe(false);
    expect(pulledLoose(0, -32)).toBe(true);
    expect(pulledLoose(23, 23)).toBe(true);
  });

  it("keeps the docked width between 320px and half the window, 380px when it is not a number (#432)", () => {
    expect(clampDockW(100, 1200)).toBe(320);
    expect(clampDockW(450, 1200)).toBe(450);
    expect(clampDockW(900, 1200)).toBe(600);
    expect(clampDockW(900, 500)).toBe(320);
    expect(clampDockW(Number.NaN, 1200)).toBe(380);
  });

  it("widens a right dock by dragging its inner edge left and a left dock by dragging it right (#432)", () => {
    expect(dragDockW(380, "right", -40, 1200)).toBe(420);
    expect(dragDockW(380, "right", 40, 1200)).toBe(340);
    expect(dragDockW(380, "left", 40, 1200)).toBe(420);
    expect(dragDockW(380, "left", -40, 1200)).toBe(340);
  });

  it("docks on an arrow key toward an edge the window touches, undocks on one away from the edge it is docked to (#432)", () => {
    const right = { left: false, right: true };
    const left = { left: true, right: false };
    const none = { left: false, right: false };
    expect(keyDock(null, "ArrowRight", right)).toBe("right");
    expect(keyDock(null, "ArrowLeft", left)).toBe("left");
    expect(keyDock(null, "ArrowRight", none)).toBeNull();
    expect(keyDock(null, "ArrowRight", left)).toBeNull();
    expect(keyDock(null, "ArrowUp", right)).toBeNull();
    expect(keyDock("right", "ArrowLeft", none)).toBe("undock");
    expect(keyDock("left", "ArrowRight", none)).toBe("undock");
    expect(keyDock("right", "ArrowRight", right)).toBeNull();
    expect(keyDock("left", "ArrowLeft", left)).toBeNull();
  });

  it("gives a panel that comes loose its remembered size or a 420x600 window, kept on screen (#432)", () => {
    expect(floatSize({ w: 500, h: 640 }, vp)).toEqual({ w: 500, h: 640 });
    expect(floatSize(null, vp)).toEqual({ w: 420, h: 600 });
    expect(floatSize(null, { w: 400, h: 500 })).toEqual({ w: 384, h: 484 });
  });

  it("holds a panel that comes loose by the same spot of its header, kept on screen (#432)", () => {
    const size = { w: 400, h: 600 };
    // Grabbed halfway across, 20px down: the window's centre is under the pointer.
    expect(looseAt({ x: 600, y: 120 }, { share: 0.5, dy: 20 }, size, vp)).toEqual({ r: 400, b: 100 });
    expect(looseAt({ x: 5, y: 10 }, { share: 0.5, dy: 20 }, size, vp)).toEqual({ r: 800, b: 200 });
    expect(looseAt({ x: 1195, y: 790 }, { share: 0.5, dy: 20 }, size, vp)).toEqual({ r: 0, b: 0 });
  });

  it("sets a window undocked from the keyboard just in from the edge it left (#432)", () => {
    expect(floatBeside("right", { w: 420, h: 600 }, vp)).toEqual({ r: 16, b: 16 });
    expect(floatBeside("left", { w: 420, h: 600 }, vp)).toEqual({ r: 764, b: 16 });
  });

  describe("remembered side and width", () => {
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

    it("remembers the side and forgets it when undocked (#432)", () => {
      expect(readDock()).toBeNull();
      writeDock("left");
      expect(store.get(DOCK_KEY)).toBe("left");
      expect(readDock()).toBe("left");
      writeDock(null);
      expect(store.has(DOCK_KEY)).toBe(false);
      expect(readDock()).toBeNull();
    });

    it("reads no side from anything but left or right (#432)", () => {
      for (const raw of ["top", "", "LEFT", "true", "null"]) {
        store.set(DOCK_KEY, raw);
        expect(readDock(), raw).toBeNull();
      }
    });

    it("remembers the docked width, 380px by default and never under 320px (#432)", () => {
      expect(readDockW()).toBe(380);
      writeDockW(450.4);
      expect(store.get(DOCK_W_KEY)).toBe("450");
      expect(readDockW()).toBe(450);
      store.set(DOCK_W_KEY, "100");
      expect(readDockW()).toBe(320);
      store.set(DOCK_W_KEY, "wide");
      expect(readDockW()).toBe(380);
    });

    it("works when storage throws (#432)", () => {
      const blocked = () => {
        throw new Error("blocked");
      };
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: blocked, setItem: blocked, removeItem: blocked } });
      expect(readDock()).toBeNull();
      expect(readDockW()).toBe(380);
      expect(() => writeDock("right")).not.toThrow();
      expect(() => writeDockW(400)).not.toThrow();
    });
  });
});
