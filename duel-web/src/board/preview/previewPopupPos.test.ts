import { describe, expect, it } from "vitest";
import { clampPreviewPopupPos, dodgePreviewPopup, parsePreviewPopupPos, placePreviewPopup, serializePreviewPopupPos, type Rect } from "./previewPopupPos";

const view = { width: 1000, height: 800 };
const size = { width: 300, height: 500 };

describe("card preview pop-up position (#529)", () => {
  it("keeps a spot inside the window as it is (#529)", () => {
    expect(clampPreviewPopupPos({ x: 120, y: 90 }, size, view)).toEqual({ x: 120, y: 90 });
  });

  it("stops the pop-up 8px short of every edge (#529)", () => {
    expect(clampPreviewPopupPos({ x: -50, y: -50 }, size, view)).toEqual({ x: 8, y: 8 });
    expect(clampPreviewPopupPos({ x: 900, y: 700 }, size, view)).toEqual({ x: 1000 - 8 - 300, y: 800 - 8 - 500 });
  });

  it("a pop-up taller than the window keeps its top-left corner on screen (#529)", () => {
    expect(clampPreviewPopupPos({ x: 100, y: 400 }, { width: 300, height: 900 }, view)).toEqual({ x: 100, y: 8 });
  });

  it("reads a saved x,y and writes it back rounded (#529)", () => {
    expect(parsePreviewPopupPos("640,72")).toEqual({ x: 640, y: 72 });
    expect(serializePreviewPopupPos({ x: 640.4, y: 72.6 })).toBe("640,73");
  });

  it("an empty or unreadable spot means the default spot (#529)", () => {
    for (const bad of ["", "12", "a,b", "1,2,3", ",5", "5,"]) expect(parsePreviewPopupPos(bad), bad).toBeNull();
  });
});

describe("card preview pop-up steps off the hovered card (#583)", () => {
  const popup = { width: 300, height: 400 };
  const at = { x: 600, y: 72 };

  it("stays put when it does not touch the card or its 12px gap (#583)", () => {
    expect(dodgePreviewPopup(at, popup, { left: 100, top: 500, right: 200, bottom: 640 }, view)).toBe(at);
    expect(dodgePreviewPopup(at, popup, { left: 400, top: 100, right: 500, bottom: 240 }, view)).toBe(at);
  });

  it("moves to the left of a card under it, 12px clear, keeping its height (#583)", () => {
    const card = { left: 650, top: 200, right: 750, bottom: 340 };
    expect(dodgePreviewPopup(at, popup, card, view)).toEqual({ x: 650 - 12 - 300, y: 72 });
  });

  it("goes to the right of the card when there is no room on its left (#583)", () => {
    const card = { left: 150, top: 200, right: 250, bottom: 340 };
    expect(dodgePreviewPopup({ x: 100, y: 72 }, popup, card, view)).toEqual({ x: 250 + 12, y: 72 });
  });

  it("with no room either side it takes the roomier side, kept on screen (#583)", () => {
    const wide = { left: 100, top: 200, right: 850, bottom: 340 };
    expect(dodgePreviewPopup({ x: 400, y: 72 }, popup, wide, view)).toEqual({ x: 1000 - 8 - 300, y: 72 });
  });
});

describe("card preview pop-up stays off the action button (#1343)", () => {
  const hits = (p: { x: number; y: number }, size: { width: number; height: number }, r: Rect) =>
    p.x < r.right && p.x + size.width > r.left && p.y < r.bottom && p.y + size.height > r.top;

  // 1280x720 with Actions beside: the pop-up opens left of the side column (x 714..1014) and the dock sits between the board and the column.
  const desk = { width: 1280, height: 720 };
  const popup = { width: 300, height: 520 };
  const home = { x: 1030 - 16 - 300, y: 72 };
  const dock: Rect = { left: 889, top: 337, right: 1028, bottom: 445 };

  it("a card far from the dock still leaves the dock clear, stepping to its left (#1343)", () => {
    const far: Rect = { left: 100, top: 500, right: 190, bottom: 640 };
    const at = placePreviewPopup(home, popup, far, desk, [dock]);
    expect(hits(at, popup, dock)).toBe(false);
    expect(at).toEqual({ x: dock.left - 8 - popup.width, y: 72 });
  });

  it("a hand card in the side column: the pop-up clears both the card and the dock (#1343)", () => {
    const handCard: Rect = { left: 1043, top: 408, right: 1110, bottom: 500 };
    const at = placePreviewPopup(home, popup, handCard, desk, [dock]);
    expect(hits(at, popup, dock)).toBe(false);
    expect(hits(at, popup, handCard)).toBe(false);
  });

  it("a card right next to the dock: the pop-up clears the dock and the card (#1343)", () => {
    const next: Rect = { left: 790, top: 400, right: 870, bottom: 540 };
    const at = placePreviewPopup(home, popup, next, desk, [dock]);
    expect(hits(at, popup, dock)).toBe(false);
    expect(hits(at, popup, next)).toBe(false);
  });

  it("leaves the spot alone when the dock is not in the way (#1343)", () => {
    const farDock: Rect = { left: 100, top: 600, right: 240, bottom: 700 };
    expect(placePreviewPopup(home, popup, null, desk, [farDock])).toBe(home);
    expect(placePreviewPopup(home, popup, null, desk, [])).toBe(home);
  });

  it("with no room either side it goes above or below the dock, whichever is nearer (#1343)", () => {
    const narrow = { width: 400, height: 1000 };
    const small = { width: 300, height: 400 };
    const wide: Rect = { left: 20, top: 500, right: 380, bottom: 560 };
    expect(placePreviewPopup({ x: 50, y: 300 }, small, null, narrow, [wide])).toEqual({ x: 50, y: 500 - 8 - 400 });
  });

  it("prefers a spot clear of the hovered card over a nearer one that touches it (#1343)", () => {
    const narrow = { width: 400, height: 1000 };
    const small = { width: 300, height: 300 };
    const wide: Rect = { left: 20, top: 500, right: 380, bottom: 560 };
    const card: Rect = { left: 20, top: 192, right: 110, bottom: 290 };
    const at = placePreviewPopup({ x: 50, y: 300 }, small, card, narrow, [wide]);
    expect(hits(at, small, wide)).toBe(false);
    expect(hits(at, small, card)).toBe(false);
  });

  it("never lands on the dock wherever the pointer is, at three window sizes (#1343)", () => {
    const sizes = [
      { view: { width: 1280, height: 720 }, dock: { left: 889, top: 337, right: 1028, bottom: 445 } },
      { view: { width: 1440, height: 900 }, dock: { left: 1000, top: 420, right: 1160, bottom: 540 } },
      { view: { width: 1920, height: 1080 }, dock: { left: 1380, top: 500, right: 1560, bottom: 640 } },
    ];
    for (const { view: v, dock: d } of sizes) {
      const box = { width: 300, height: Math.min(520, v.height - 80) };
      const start = { x: v.width - 250 - 16 - box.width, y: 72 };
      for (let x = 20; x < v.width - 70; x += 60) {
        for (let y = 60; y < v.height - 100; y += 70) {
          const card: Rect = { left: x, top: y, right: x + 70, bottom: y + 98 };
          const at = placePreviewPopup(start, box, card, v, [d]);
          expect(hits(at, box, d), `${v.width}x${v.height} card at ${x},${y}`).toBe(false);
        }
      }
    }
  });
});
