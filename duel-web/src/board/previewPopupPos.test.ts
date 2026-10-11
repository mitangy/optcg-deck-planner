import { describe, expect, it } from "vitest";
import { clampPreviewPopupPos, parsePreviewPopupPos, serializePreviewPopupPos } from "./previewPopupPos";

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
