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
