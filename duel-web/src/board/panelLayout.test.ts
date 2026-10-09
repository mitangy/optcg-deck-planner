import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_LAYOUT,
  collapsedColumns,
  movePanel,
  nudgePanel,
  panelDropAt,
  parsePanelLayout,
  serializePanelLayout,
  type PanelId,
  type PanelRect,
  matSpotAt,
} from "./panelLayout";

describe("parsePanelLayout", () => {
  it("reads a saved layout with the hand in the left column (#261)", () => {
    expect(parsePanelLayout("preview,hand,recent,log|oppHand,turn,chat")).toEqual({
      left: ["preview", "hand", "recent", "log"],
      right: ["oppHand", "turn", "chat"],
    });
  });

  it("drops unknown and repeated panels and puts missing ones back in their default column (#261)", () => {
    expect(parsePanelLayout("hand,bogus,hand,chat|log")).toEqual({
      left: ["hand", "chat", "preview", "recent"],
      right: ["log", "oppHand", "turn"],
    });
  });

  it("drops the retired Actions panel from an older saved layout (#368)", () => {
    expect(parsePanelLayout("preview,recent,log|oppHand,turn,actions,hand,chat")).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout("actions,preview|log").left).not.toContain("actions");
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
      right: ["oppHand", "turn", "chat"],
    });
    expect(movePanel(DEFAULT_PANEL_LAYOUT, "preview", "right", null)).toEqual({
      left: ["recent", "log"],
      right: ["oppHand", "turn", "hand", "chat", "preview"],
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
  { id: "chat", column: "right", top: 200, bottom: 300 },
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
    // Above chat's own middle while dragging chat: the slot is before hand.
    expect(panelDropAt(COLS, PANELS, "chat", 1100, 240)).toEqual({ column: "right", beforeId: "hand" });
  });
});

describe("nudgePanel", () => {
  const visible = new Set<PanelId>(["preview", "recent", "log", "oppHand", "turn", "chat"]);

  it("moves past a hidden panel in one step, which keeps its place (#261)", () => {
    // The Grid hand is off screen (fan hand): Down on turn swaps it with chat.
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "turn", "down", visible).right).toEqual([
      "oppHand",
      "hand",
      "chat",
      "turn",
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
      right: ["oppHand", "turn", "hand"],
    });
    expect(nudgePanel(DEFAULT_PANEL_LAYOUT, "chat", "right", visible)).toBe(DEFAULT_PANEL_LAYOUT);
  });
});

describe("matSpotAt", () => {
  // Mat 600 px wide from x 300, top at y 100, 500 px tall (top band 100 px).
  const mat = { left: 300, right: 900, top: 100, bottom: 600 };

  it("pins to the left, centre or right third over the top of the mat (#264)", () => {
    expect(matSpotAt(mat, 350, 120)).toBe("left");
    expect(matSpotAt(mat, 600, 120)).toBe("centre");
    expect(matSpotAt(mat, 850, 120)).toBe("right");
    // Just above the mat counts too.
    expect(matSpotAt(mat, 600, 70)).toBe("centre");
  });

  it("is not a mat spot lower on the mat or beside it, so the panel goes to a column (#264)", () => {
    expect(matSpotAt(mat, 600, 300)).toBeNull();
    expect(matSpotAt(mat, 250, 120)).toBeNull();
    expect(matSpotAt(mat, 600, 20)).toBeNull();
  });

  // The opponent's mat sits 150 px in from each side of the playmat, 100 to 350 px down.
  const opp = { left: 450, right: 750, top: 100, bottom: 350 };

  it("pins to the open space beside the opponent mat, down to the mat's bottom edge (#462)", () => {
    expect(matSpotAt(mat, 350, 120, opp)).toBe("left");
    expect(matSpotAt(mat, 350, 340, opp)).toBe("left");
    expect(matSpotAt(mat, 850, 340, opp)).toBe("right");
    // Over the mat itself the top band still works by thirds.
    expect(matSpotAt(mat, 600, 120, opp)).toBe("centre");
    expect(matSpotAt(mat, 480, 120, opp)).toBe("left");
  });

  it("is not a spot in the open space below the opponent mat's bottom edge (#462)", () => {
    expect(matSpotAt(mat, 350, 400, opp)).toBeNull();
    expect(matSpotAt(mat, 850, 400, opp)).toBeNull();
  });
});

describe("collapsedColumns", () => {
  const none = { left: [], right: ["turn", "hand"] } as Record<"left" | "right", PanelId[]>;

  it("collapses a column with no panel to show so the board gets its width (#449)", () => {
    expect(collapsedColumns(none, false)).toEqual({ left: true, right: false });
    expect(collapsedColumns({ left: ["log"], right: [] }, false)).toEqual({ left: false, right: true });
  });

  it("keeps both columns open while a panel is dragged, so they stay drop targets (#449)", () => {
    expect(collapsedColumns(none, true)).toEqual({ left: false, right: false });
  });

  it("keeps a column that holds the defend tray (#449)", () => {
    expect(collapsedColumns({ left: ["log"], right: [] }, false, { right: true })).toEqual({
      left: false,
      right: false,
    });
  });
});
