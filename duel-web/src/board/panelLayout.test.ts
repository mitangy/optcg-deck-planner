import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_LAYOUT,
  movePanel,
  nudgePanel,
  panelDropAt,
  parsePanelLayout,
  serializePanelLayout,
  type PanelId,
  type PanelRect,
} from "./panelLayout";

describe("parsePanelLayout", () => {
  it("reads a saved layout with the hand in the left column (#261)", () => {
    expect(parsePanelLayout("preview,hand,recent,log|oppHand,turn,actions,chat")).toEqual({
      left: ["preview", "hand", "recent", "log"],
      right: ["oppHand", "turn", "actions", "chat"],
    });
  });

  it("drops unknown and repeated panels and puts missing ones back in their default column (#261)", () => {
    expect(parsePanelLayout("hand,bogus,hand,chat|log")).toEqual({
      left: ["hand", "chat", "preview", "recent"],
      right: ["log", "oppHand", "turn", "actions"],
    });
  });
});

describe("serializePanelLayout", () => {
  it("saves the default layout as empty, and a moved one so it reads back the same (#261)", () => {
    expect(serializePanelLayout(DEFAULT_PANEL_LAYOUT)).toBe("");
    const moved = movePanel(DEFAULT_PANEL_LAYOUT, "hand", "left", "log");
    const saved = serializePanelLayout(moved);
    expect(saved).not.toBe("");
    expect(parsePanelLayout(saved)).toEqual(moved);
  });
});

describe("movePanel", () => {
  it("moves a panel into the other column before a given panel, or to its end (#261)", () => {
    expect(movePanel(DEFAULT_PANEL_LAYOUT, "hand", "left", "recent")).toEqual({
      left: ["preview", "hand", "recent", "log"],
      right: ["oppHand", "turn", "actions", "chat"],
    });
    expect(movePanel(DEFAULT_PANEL_LAYOUT, "preview", "right", null)).toEqual({
      left: ["recent", "log"],
      right: ["oppHand", "turn", "actions", "hand", "chat", "preview"],
    });
  });

  it("reorders within a column (#261)", () => {
    expect(movePanel(DEFAULT_PANEL_LAYOUT, "log", "left", "preview").left).toEqual([
      "log",
      "preview",
      "recent",
    ]);
  });
});

const COLS = { left: { left: 0, right: 200 }, right: { left: 1000, right: 1300 } };
const PANELS: PanelRect[] = [
  { id: "preview", column: "left", top: 0, bottom: 400 },
  { id: "recent", column: "left", top: 400, bottom: 550 },
  { id: "log", column: "left", top: 550, bottom: 900 },
  { id: "turn", column: "right", top: 0, bottom: 200 },
  { id: "actions", column: "right", top: 200, bottom: 300 },
  { id: "hand", column: "right", top: 300, bottom: 900 },
];

describe("panelDropAt", () => {
  it("lands before the first panel whose middle is below the pointer (#261)", () => {
    // y 460 is above recent's middle (475): before recent, not before log.
    expect(panelDropAt(COLS, PANELS, "hand", 100, 460)).toEqual({ column: "left", beforeId: "recent" });
    expect(panelDropAt(COLS, PANELS, "hand", 100, 500)).toEqual({ column: "left", beforeId: "log" });
    expect(panelDropAt(COLS, PANELS, "hand", 100, 800)).toEqual({ column: "left", beforeId: null });
  });

  it("picks the nearer column while the pointer is over the board (#261)", () => {
    expect(panelDropAt(COLS, PANELS, "log", 350, 100).column).toBe("left");
    expect(panelDropAt(COLS, PANELS, "log", 900, 100).column).toBe("right");
  });

  it("ignores the dragged panel itself when finding the slot (#261)", () => {
    // Above actions' own middle while dragging actions: the slot is before hand.
    expect(panelDropAt(COLS, PANELS, "actions", 1100, 240)).toEqual({ column: "right", beforeId: "hand" });
  });
});

describe("nudgePanel", () => {
  const visible = new Set<PanelId>(["preview", "recent", "log", "oppHand", "turn", "actions", "chat"]);

  it("moves past a hidden panel in one step, which keeps its place (#261)", () => {
    // The Grid hand is off screen (fan hand): Down on actions swaps it with chat.
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "actions", "down", visible).right).toEqual([
      "oppHand",
      "turn",
      "hand",
      "chat",
      "actions",
    ]);
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "recent", "up", visible).left).toEqual([
      "recent",
      "preview",
      "log",
    ]);
  });

  it("sends a panel to the end of the other column with Left / Right (#261)", () => {
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "chat", "left", visible)).toEqual({
      left: ["preview", "recent", "log", "chat"],
      right: ["oppHand", "turn", "actions", "hand"],
    });
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "chat", "right", visible)).toBe(DEFAULT_PANEL_LAYOUT);
  });
});
