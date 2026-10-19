import { describe, expect, it } from "vitest";
import { clampPreviewPopupPos, dodgePreviewPopup, parsePreviewPopupPos, serializePreviewPopupPos } from "./previewPopupPos";

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
    // 92px free on the left, 142px on the right: the right side, clamped to the window.
    expect(dodgePreviewPopup({ x: 400, y: 72 }, popup, wide, view)).toEqual({ x: 1000 - 8 - 300, y: 72 });
  });
});
