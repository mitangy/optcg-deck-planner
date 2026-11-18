export type FieldDevice = {
  desktop: boolean;
  tiltFits: boolean;
  finePointer: boolean;
  portrait: boolean;
  sidewaysFan?: boolean;
};

export type ShowKey = "showCardPreview" | "showChat";

export type ToggleKey =
  | "sortHandByCost"
  | "keepHandOpen"
  | "layoutGrips"
  | "oneTapActions"
  | "dimUnplayable"
  | "shortcutTags"
  | "handCounters"
  | "cantAttackWarning"
  | "battleArrow"
  | "attackGlow"
  | "compactOwnBoard"
  | "previewBigCard"
  | "previewPopup"
  | "donUpright"
  | "totalPower"
  | "oppHandTopRight"
  | "tiltedBoard"
  | "bigBoard"
  | "actionsBeside"
  | "turnSplash"
  | "gameHints"
  | "reduceMotion"
  | "turnAlert"
  | "turnSound"
  | "spectatorSound"
  | "quietWatchTabs";

export function showToggleShown(key: ShowKey, d: FieldDevice): boolean {
  return key === "showChat" ? true : d.desktop;
}

export function showOrientation(d: FieldDevice): boolean {
  return !d.finePointer;
}

export function toggleShown(key: ToggleKey, d: FieldDevice): boolean {
  if (key === "tiltedBoard") return d.tiltFits;
  if (key === "layoutGrips") return d.desktop;
  if (key === "actionsBeside") return d.desktop;
  // The card preview panel is the desktop side column; phones don't show it.
  if (key === "previewBigCard") return d.desktop;
  if (key === "previewPopup") return d.desktop;
  if (key === "keepHandOpen") return d.desktop || d.sidewaysFan === true;
  if (key === "shortcutTags") return d.finePointer;
  if (key === "compactOwnBoard") return !d.desktop;
  if (key === "oppHandTopRight") return !d.desktop;
  return true;
}

export function turnAlertCopy(
  d: FieldDevice,
  phone: { label: string; hint: string },
): { label: string; hint: string } {
  if (!d.finePointer) return phone;
  return {
    label: "Tab alert",
    hint: "Marks the browser tab when the game needs you.",
  };
}

export type SelectRowKey =
  | "endTurnConfirm"
  | "responseStops"
  | "handLayout"
  | "screenOrientation"
  | "oppHandSpot"
  | "sidePanels"
  | "textSize"
  | "lifeFan"
  | "sideColumns"
  | "animationSpeed"
  | "cardSpotlight"
  | "popupSize"
  | "previewPopupSize"
  | "showOnScreen";

export type RowKey = ToggleKey | SelectRowKey;

export type GroupId = "turns" | "hand" | "board" | "visual" | "motion" | "sound" | "spectating";

export type GameplayGroup = {
  id: GroupId;
  title: string;
  chip: string;
  rows: RowKey[];
};

export const GAMEPLAY_GROUPS: GameplayGroup[] = [
  {
    id: "turns",
    title: "Turns and prompts",
    chip: "Turns",
    rows: ["endTurnConfirm", "responseStops", "oneTapActions", "cantAttackWarning", "turnSplash", "gameHints"],
  },
  {
    id: "hand",
    title: "Hand",
    chip: "Hand",
    rows: ["handLayout", "sortHandByCost", "keepHandOpen", "dimUnplayable", "handCounters"],
  },
  {
    id: "board",
    title: "Board and layout",
    chip: "Board",
    rows: [
      "bigBoard",
      "actionsBeside",
      "tiltedBoard",
      "compactOwnBoard",
      "screenOrientation",
      "oppHandSpot",
      "oppHandTopRight",
      "lifeFan",
      "sideColumns",
      "previewBigCard",
      "previewPopup",
      "popupSize",
      "previewPopupSize",
      "layoutGrips",
      "sidePanels",
      "showOnScreen",
    ],
  },
  {
    id: "visual",
    title: "Visual aids",
    chip: "Visual aids",
    rows: ["textSize", "attackGlow", "battleArrow", "donUpright", "totalPower", "shortcutTags"],
  },
  {
    id: "motion",
    title: "Animations",
    chip: "Animations",
    rows: ["animationSpeed", "cardSpotlight", "reduceMotion"],
  },
  {
    id: "sound",
    title: "Sound and alerts",
    chip: "Sound",
    rows: ["turnSound", "turnAlert"],
  },
  {
    id: "spectating",
    title: "Spectating",
    chip: "Spectating",
    rows: ["spectatorSound", "quietWatchTabs"],
  },
];

export function playerOnlyRow(key: RowKey): boolean {
  switch (key) {
    case "endTurnConfirm":
    case "responseStops":
    case "oneTapActions":
    case "cantAttackWarning":
    case "gameHints":
    case "handLayout":
    case "sortHandByCost":
    case "keepHandOpen":
    // Spectators have no legal plays to dim.
    case "dimUnplayable":
    case "actionsBeside":
    case "attackGlow":
    case "shortcutTags":
    case "turnAlert":
      return true;
    default:
      return false;
  }
}

export function rowShown(key: RowKey, d: FieldDevice): boolean {
  switch (key) {
    case "screenOrientation":
      return showOrientation(d);
    case "oppHandSpot":
    case "sideColumns":
    case "sidePanels":
      return d.desktop;
    case "popupSize":
      return true;
    case "previewPopupSize":
      return d.desktop;
    case "endTurnConfirm":
    case "responseStops":
    case "handLayout":
    case "textSize":
    case "lifeFan":
    case "animationSpeed":
    case "cardSpotlight":
    case "showOnScreen":
      return true;
    default:
      return toggleShown(key, d);
  }
}

export function rowDisabledNote(
  key: RowKey,
  d: FieldDevice,
  s: { compactOwnBoard: boolean; handLayout?: string },
): string | null {
  const sideways = !d.desktop && !d.portrait;
  switch (key) {
    case "handLayout":
      return sideways && !d.sidewaysFan ? "Sideways, your hand is always the grid on the right." : null;
    case "compactOwnBoard":
      return sideways ? "Only for phones held upright." : null;
    case "keepHandOpen":
      if (d.desktop) return null;
      if (d.portrait) return "Only when the screen is held sideways.";
      return s.handLayout === "fan" ? null : "Pick Fan in Hand layout to use this.";
    case "lifeFan":
      return d.portrait && s.compactOwnBoard
        ? "Simple board shows Life as a count. Turn it off to use this."
        : null;
    default:
      return null;
  }
}

export function visibleGroups(
  d: FieldDevice,
  groups: GameplayGroup[] = GAMEPLAY_GROUPS,
  opts: { spectating?: boolean } = {},
): GameplayGroup[] {
  const spectating = opts.spectating === true;
  const shown = groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => rowShown(r, d) && !(spectating && playerOnlyRow(r))),
    }))
    .filter((g) => g.rows.length > 0);
  if (!spectating) return shown;
  return [...shown.filter((g) => g.id === "spectating"), ...shown.filter((g) => g.id !== "spectating")];
}

export function groupOf(key: RowKey): GroupId | undefined {
  return GAMEPLAY_GROUPS.find((g) => g.rows.includes(key))?.id;
}
