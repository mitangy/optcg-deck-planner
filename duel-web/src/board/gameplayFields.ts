/** Which Gameplay rows a device is shown (the Settings page and the in-match sheet). */
export type FieldDevice = {
  /** Desktop window: side panels can be moved. */
  desktop: boolean;
  /** Window that can show the tilted board. */
  tiltFits: boolean;
  /** A mouse or trackpad is the main pointer: not a phone or tablet. */
  finePointer: boolean;
};

/** The "Show on screen" switches: each hides one non-core element (the Battle log has none). */
export type ShowKey = "showCardPreview" | "showRecentPlays" | "showChat";

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
  | "donUpright"
  | "oppHandTopRight"
  | "tiltedBoard"
  | "bigBoard"
  | "turnSplash"
  | "reduceMotion"
  | "turnAlert"
  | "turnSound";

/**
 * Whether a "Show on screen" switch is listed. Card preview and Recent plays
 * are desktop side panels (phones have no counterpart); Chat has one on every
 * device (desktop panel, phone pill, landscape rail button).
 */
export function showToggleShown(key: ShowKey, d: FieldDevice): boolean {
  return key === "showChat" ? true : d.desktop;
}

/** The Screen orientation lock only does anything on a phone or tablet. */
export function showOrientation(d: FieldDevice): boolean {
  return !d.finePointer;
}

/**
 * Whether a switch is listed. Tilted board needs a window that can show it,
 * Drag handles a desktop window, Opponent hand, top right a phone. Vibration is phone-only: on a desktop the
 * same switch only marks the browser tab, which the page words as a Tab alert.
 */
export function toggleShown(key: ToggleKey, d: FieldDevice): boolean {
  if (key === "tiltedBoard") return d.tiltFits;
  if (key === "layoutGrips") return d.desktop;
  // The card preview panel is the desktop side column; phones don't show it.
  if (key === "previewBigCard") return d.desktop;
  // The tucked-away fan / corner dock only exists on desktop windows.
  if (key === "keepHandOpen") return d.desktop;
  // Key tabs are only drawn with a mouse and keyboard.
  if (key === "shortcutTags") return d.finePointer;
  // The simplified own mat is the portrait phone layout; a desktop window has no count row.
  if (key === "compactOwnBoard") return !d.desktop;
  // Desktop picks the spot in the Opponent hand position list instead.
  if (key === "oppHandTopRight") return !d.desktop;
  return true;
}

/** Label and hint of the turn-alert switch: Vibration on a phone, Tab alert with a mouse. */
export function turnAlertCopy(
  d: FieldDevice,
  phone: { label: string; hint: string },
): { label: string; hint: string } {
  if (!d.finePointer) return phone;
  return {
    label: "Tab alert",
    hint: "Marks the browser tab when the game needs you while you're in another tab.",
  };
}

/** Rows that are not plain ToggleKey switches: the selects, the panel reset and the "Show on screen" box. */
export type SelectRowKey =
  | "endTurnConfirm"
  | "responseStops"
  | "handLayout"
  | "screenOrientation"
  | "oppHandSpot"
  | "sidePanels"
  | "textSize"
  | "lifeFan"
  | "animationSpeed"
  | "cardSpotlight"
  | "showOnScreen";

export type RowKey = ToggleKey | SelectRowKey;

export type GroupId = "turns" | "hand" | "board" | "visual" | "motion" | "sound";

export type GameplayGroup = {
  id: GroupId;
  /** Heading shown above the group. */
  title: string;
  /** Short label on the jump chip. */
  chip: string;
  /** Rows in the order they are listed. */
  rows: RowKey[];
};

/** The Gameplay settings groups, in display order (the Settings page and the in-match sheet). */
export const GAMEPLAY_GROUPS: GameplayGroup[] = [
  {
    id: "turns",
    title: "Turns and prompts",
    chip: "Turns",
    rows: ["endTurnConfirm", "responseStops", "oneTapActions", "cantAttackWarning", "turnSplash"],
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
      "tiltedBoard",
      "compactOwnBoard",
      "screenOrientation",
      "oppHandSpot",
      "oppHandTopRight",
      "lifeFan",
      "previewBigCard",
      "layoutGrips",
      "sidePanels",
      "showOnScreen",
    ],
  },
  {
    id: "visual",
    title: "Visual aids",
    chip: "Visual aids",
    rows: ["textSize", "attackGlow", "battleArrow", "donUpright", "shortcutTags"],
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
];

/** Whether a row is listed on this device (switches follow toggleShown; the rest are always there unless noted). */
export function rowShown(key: RowKey, d: FieldDevice): boolean {
  switch (key) {
    case "screenOrientation":
      return showOrientation(d);
    // Desktop picks the spot in a list; phones get the Opponent hand, top right switch.
    case "oppHandSpot":
    case "sidePanels":
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

/** The groups that have at least one row on this device, each with only its visible rows. */
export function visibleGroups(d: FieldDevice, groups: GameplayGroup[] = GAMEPLAY_GROUPS): GameplayGroup[] {
  return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => rowShown(r, d)) })).filter(
    (g) => g.rows.length > 0,
  );
}

/** The group a row belongs to. */
export function groupOf(key: RowKey): GroupId | undefined {
  return GAMEPLAY_GROUPS.find((g) => g.rows.includes(key))?.id;
}
