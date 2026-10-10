import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_GROUPS,
  groupOf,
  rowShown,
  showOrientation,
  showToggleShown,
  toggleShown,
  turnAlertCopy,
  visibleGroups,
  type FieldDevice,
  type GameplayGroup,
  type RowKey,
} from "./gameplayFields";

const desktop: FieldDevice = { desktop: true, tiltFits: true, finePointer: true };
const phone: FieldDevice = { desktop: false, tiltFits: false, finePointer: false };

describe("gameplay rows by device", () => {
  it("hides the screen orientation lock with a mouse and shows it on a phone (#281)", () => {
    expect(showOrientation(desktop)).toBe(false);
    expect(showOrientation(phone)).toBe(true);
  });

  it("words the turn-alert switch as Tab alert with a mouse and keeps Vibration on a phone (#281)", () => {
    const vibration = { label: "Vibration", hint: "Short buzzes on supported phones." };
    expect(turnAlertCopy(phone, vibration)).toEqual(vibration);
    const onDesktop = turnAlertCopy(desktop, vibration);
    expect(onDesktop.label).toBe("Tab alert");
    expect(onDesktop.hint).not.toMatch(/phone|buzz/i);
  });

  it("lists Tilted board only where it can show and Drag handles only on a desktop window (#281)", () => {
    expect(toggleShown("tiltedBoard", desktop)).toBe(true);
    expect(toggleShown("tiltedBoard", phone)).toBe(false);
    expect(toggleShown("layoutGrips", desktop)).toBe(true);
    expect(toggleShown("layoutGrips", { ...desktop, desktop: false })).toBe(false);
    expect(toggleShown("turnSound", phone)).toBe(true);
  });

  it("lists Simple board only on phones and tablets, not a desktop window (#445)", () => {
    expect(toggleShown("compactOwnBoard", phone)).toBe(true);
    expect(toggleShown("compactOwnBoard", desktop)).toBe(false);
  });
});

describe("Show on screen rows by device (#449)", () => {
  it("lists Card preview and Recent plays only where those panels exist, and Chat everywhere", () => {
    expect(showToggleShown("showCardPreview", desktop)).toBe(true);
    expect(showToggleShown("showRecentPlays", desktop)).toBe(true);
    expect(showToggleShown("showCardPreview", phone)).toBe(false);
    expect(showToggleShown("showRecentPlays", phone)).toBe(false);
    expect(showToggleShown("showChat", phone)).toBe(true);
    expect(showToggleShown("showChat", desktop)).toBe(true);
  });
});

describe("Gameplay settings groups (#496)", () => {
  // Every row the Gameplay fields can render: the switches and the selects. A row left out of the groups would vanish from the UI.
  const ALL_ROWS: RowKey[] = [
    "endTurnConfirm", "responseStops", "handLayout", "screenOrientation", "oppHandSpot", "sidePanels", "textSize", "lifeFan",
    "animationSpeed", "cardSpotlight", "showOnScreen",
    "sortHandByCost", "keepHandOpen", "layoutGrips", "oneTapActions", "dimUnplayable", "shortcutTags", "handCounters",
    "cantAttackWarning", "battleArrow", "attackGlow", "compactOwnBoard", "previewBigCard", "donUpright", "oppHandTopRight",
    "tiltedBoard", "bigBoard", "turnSplash", "reduceMotion", "turnAlert", "turnSound",
  ];

  it("every gameplay switch and select belongs to exactly one group and none is dropped (#496)", () => {
    const listed = GAMEPLAY_GROUPS.flatMap((g) => g.rows);
    expect([...listed].sort()).toEqual([...ALL_ROWS].sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(groupOf("turnSound")).toBe("sound");
    expect(groupOf("bigBoard")).toBe("board");
  });

  it("keeps the six groups in order (#496)", () => {
    expect(GAMEPLAY_GROUPS.map((g) => g.id)).toEqual(["turns", "hand", "board", "visual", "motion", "sound"]);
  });

  it("lists a row only in the groups where the device shows it, so phone and desktop differ (#496)", () => {
    const phoneBoard = visibleGroups(phone).find((g) => g.id === "board")!.rows;
    const desktopBoard = visibleGroups(desktop).find((g) => g.id === "board")!.rows;
    expect(phoneBoard).toContain("oppHandTopRight");
    expect(phoneBoard).toContain("screenOrientation");
    expect(phoneBoard).not.toContain("sidePanels");
    expect(desktopBoard).toContain("sidePanels");
    expect(desktopBoard).toContain("oppHandSpot");
    expect(desktopBoard).not.toContain("oppHandTopRight");
    expect(rowShown("screenOrientation", desktop)).toBe(false);
  });

  it("a group with no rows on a device is hidden (#496)", () => {
    const desktopOnly: GameplayGroup = { id: "board", title: "Desk", chip: "Desk", rows: ["layoutGrips", "sidePanels"] };
    expect(visibleGroups(phone, [desktopOnly])).toEqual([]);
    expect(visibleGroups(desktop, [desktopOnly]).map((g) => g.id)).toEqual(["board"]);
  });
});
