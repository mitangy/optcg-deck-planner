import { describe, expect, it } from "vitest";
import {
  clampColumnWidth,
  columnMinPx,
  panelMinHeight,
  nudgeColumnWidth,
  parsePanelSizes,
  serializePanelSizes,
  splitHeights,
} from "./panelSizes";

describe("panel sizes (#347)", () => {
  it("reads saved widths and shares and writes them back the same (#347)", () => {
    const saved = "L=260;R=340;preview=0.45,log=0.3";
    const sizes = parsePanelSizes(saved);
    expect(sizes).toEqual({ widths: { left: 260, right: 340 }, heights: { preview: 0.45, log: 0.3 } });
    expect(serializePanelSizes(sizes)).toBe(saved);
  });

  it("saves no sizes as an empty string (#347)", () => {
    expect(serializePanelSizes(parsePanelSizes(""))).toBe("");
  });

  it("drops unknown panels, junk and out-of-range values (#347)", () => {
    const sizes = parsePanelSizes("L=50;R=9999;L=abc;bogus=0.4,preview=2,log=0.01,recent=0.5,chat=x");
    expect(sizes.widths).toEqual({});
    expect(sizes.heights).toEqual({ recent: 0.5 });
  });

  it("keeps the good values next to a bad one (#347)", () => {
    const sizes = parsePanelSizes("R=300;nope;turn=0.2,;;log=0.6");
    expect(sizes).toEqual({ widths: { right: 300 }, heights: { turn: 0.2, log: 0.6 } });
  });

  it("clamps a column to 180px and to a third of the window, 560px at most (#347)", () => {
    expect(clampColumnWidth(100, 1440)).toBe(180);
    expect(clampColumnWidth(900, 3000)).toBe(560);
    expect(clampColumnWidth(900, 1000)).toBe(340);
    expect(clampColumnWidth(300, 1440)).toBe(300);
  });

  it("steps a column by 16px and stays inside the limits (#347)", () => {
    expect(nudgeColumnWidth(300, true, 1440)).toBe(316);
    expect(nudgeColumnWidth(300, false, 1440)).toBe(284);
    expect(nudgeColumnWidth(184, false, 1440)).toBe(180);
  });

  it("moves height between two panels and keeps their total (#347)", () => {
    const [a, b] = splitHeights(200, 300, 50, 72, 72);
    expect(a).toBe(250);
    expect(b).toBe(250);
    expect(splitHeights(200, 300, -80, 72, 72)).toEqual([120, 380]);
  });

  it("stops each panel at its minimum height (#347)", () => {
    expect(splitHeights(200, 300, 1000, 72, 100)).toEqual([400, 100]);
    expect(splitHeights(200, 300, -1000, 150, 72)).toEqual([150, 350]);
  });

  it("moves nothing when the two minimums do not fit (#347)", () => {
    expect(splitHeights(100, 100, 30, 150, 72)).toEqual([100, 100]);
  });

  it("a column is never narrower than the widest panel in it (#370)", () => {
    expect(columnMinPx(["preview", "recent", "log"])).toBe(200);
    expect(columnMinPx(["oppHand", "turn", "actions"])).toBe(250);
    expect(columnMinPx([])).toBe(180);
    expect(clampColumnWidth(100, 1440, 250)).toBe(250);
    expect(clampColumnWidth(300, 1440, 250)).toBe(300);
    expect(nudgeColumnWidth(260, false, 1440, 250)).toBe(250);
  });

  it("a content-sized panel keeps its natural height in a split, the others only their floor (#370)", () => {
    expect(panelMinHeight("turn", 0, 250)).toBe(250);
    expect(panelMinHeight("turn", 0, 40)).toBe(72);
    expect(panelMinHeight("log", 0, 500)).toBe(96);
    expect(panelMinHeight("preview", 0, 0)).toBe(140);
    expect(panelMinHeight("log", 200, 0)).toBe(200);
    const minTurn = panelMinHeight("turn", 0, 250);
    // Dragging the Turn / Actions divider fully up: Turn is above, Actions below.
    expect(splitHeights(300, 200, -900, minTurn, 72)).toEqual([250, 250]);
    expect(splitHeights(300, 200, -900, 72, 72)).toEqual([72, 428]);
    // Dragging the divider above Turn fully down: Turn is below.
    expect(splitHeights(300, 300, 900, 72, minTurn)).toEqual([350, 250]);
  });
});
