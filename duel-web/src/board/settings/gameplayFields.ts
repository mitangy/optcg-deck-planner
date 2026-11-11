/** Which Gameplay rows a device is shown (the Settings page and the in-match sheet). */
export type FieldDevice = {
  /** Desktop window: side panels can be moved. */
  desktop: boolean;
  /** Window that can show the tilted board. */
  tiltFits: boolean;
  /** A mouse or trackpad is the main pointer: not a phone or tablet. */
  finePointer: boolean;
  /** Portrait phone layout (PORTRAIT_MAT_QUERY): the tall board with the hand under it. */
  portrait: boolean;
  /** Tall enough for the fanned hand when held sideways (SIDEWAYS_FAN_QUERY): tablets, foldables, big phones. */
  sidewaysFan?: boolean;
};

/** The "Show on screen" switches: each hides one non-core element (the Battle log has none). */
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
  // Phones keep their own layout for the action buttons.
  if (key === "actionsBeside") return d.desktop;
  // The card preview panel is the desktop side column; phones don't show it.
  if (key === "previewBigCard") return d.desktop;
  // The pop-up replaces that same panel.
  if (key === "previewPopup") return d.desktop;
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
    hint: "Marks the browser tab when the game needs you.",
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
  // Settings that only apply while you watch a match. Last on the Settings page, first in a spectator's sheet.
  {
    id: "spectating",
    title: "Spectating",
    chip: "Spectating",
    rows: ["spectatorSound", "quietWatchTabs"],
  },
];

/**
 * Rows that change nothing a spectator sees, so the in-match sheet hides them while watching.
 * A spectator has no hand of their own, no action buttons and no prompts (checked against DuelBoard).
 */
export function playerOnlyRow(key: RowKey): boolean {
  switch (key) {
    // The End turn button and its confirm (IntentBar / PrimaryDock) are not drawn for spectators.
    case "endTurnConfirm":
    // Block / counter stops pass for the player; a spectator is never asked.
    case "responseStops":
    // Skips the confirm tap on your own actions, Counters, Blockers and DON!!.
    case "oneTapActions":
    // The warning comes from your own failed attack tap.
    case "cantAttackWarning":
    // The opening-hand tips are skipped when spectating (mulligan step is `!spectating`).
    case "gameHints":
    // Spectator fans and grids pick their own layout (specFans), ignoring Hand layout.
    case "handLayout":
    // The hand's Sort button is not drawn for spectators.
    case "sortHandByCost":
    // The tucked-away hand / Hide button is not drawn for spectator fans.
    case "keepHandOpen":
    // Fades hand cards you can't play: spectators have no legal plays to dim.
    case "dimUnplayable":
    // Spectators get no side action dock (sideActions requires !spectating).
    case "actionsBeside":
    // Glows your attackers with a legal attack; none exist while watching (dndEnabled requires !spectating).
    case "attackGlow":
    // Key tags mark action buttons and the Sort button, none of which a spectator has.
    case "shortcutTags":
    // Vibration / tab alert fire when the game needs you (alertsOn requires !spectating).
    case "turnAlert":
      return true;
    default:
      return false;
  }
}

/** Whether a row is listed on this device (switches follow toggleShown; the rest are always there unless noted). */
export function rowShown(key: RowKey, d: FieldDevice): boolean {
  switch (key) {
    case "screenOrientation":
      return showOrientation(d);
    // Desktop picks the spot in a list; phones get the Opponent hand, top right switch.
    case "oppHandSpot":
    case "sideColumns":
    case "sidePanels":
      return d.desktop;
    // Sizes every pop-up in a match, phones included.
    case "popupSize":
      return true;
    // The hover card pop-up is a desktop window feature.
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

/**
 * Why a listed row does nothing in the current layout, or null when it works. The row stays in the
 * list (turning the phone flips this, and hiding it would make rows jump) but its input is disabled;
 * the saved value is never touched.
 */
export function rowDisabledNote(
  key: RowKey,
  d: FieldDevice,
  s: { compactOwnBoard: boolean },
): string | null {
  const sideways = !d.desktop && !d.portrait;
  switch (key) {
    case "handLayout":
      return sideways && !d.sidewaysFan ? "Sideways, your hand is always the grid on the right." : null;
    case "compactOwnBoard":
      return sideways ? "Only for phones held upright." : null;
    case "lifeFan":
      return d.portrait && s.compactOwnBoard
        ? "Simple board shows Life as a count. Turn it off to use this."
        : null;
    default:
      return null;
  }
}

/**
 * The groups that have at least one row on this device, each with only its visible rows. Spectating
 * drops the rows that only matter when you play (and any group left empty) and lists the Spectating
 * group first; otherwise the Spectating group stays last, where GAMEPLAY_GROUPS puts it.
 */
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

/** The group a row belongs to. */
export function groupOf(key: RowKey): GroupId | undefined {
  return GAMEPLAY_GROUPS.find((g) => g.rows.includes(key))?.id;
}
