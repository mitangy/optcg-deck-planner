/** Past this many cards a spectator's far strip on a portrait phone scrolls instead of fanning. */
export const PHONE_FAN_MAX = 8;

/**
 * Portrait phones draw your hand as an overlapped fan whenever the Hand setting
 * is not Grid, whatever its size: a big hand overlaps more (the cards' margins
 * in board.css) rather than silently turning into the scrolling Grid (#FEEDBACK).
 */
export function usesPhoneFan(wide: boolean, handLayout: string): boolean {
  return !wide && handLayout !== "grid";
}

/**
 * The hand lives in the right column (instead of a dock or fan) on landscape phones,
 * so it never covers the field, and on tall desktop windows using the Grid layout.
 */
export function usesRailHand(wide: boolean, landscapePhone: boolean, tall: boolean, fanHand: boolean): boolean {
  return wide && (landscapePhone || (tall && !fanHand));
}

/** Where a spectator of an unranked room sees both hands: always as fans. */
export type SpectatorFans = "desktop" | "portrait" | "landscape";

/**
 * Spectators of unranked rooms get both hands face up. They have nothing to
 * play, so both are drawn as fans whatever their Hand setting says (the saved
 * setting is left alone): the desktop fans hang off the top and bottom edges of
 * the board, portrait phones get an overlapped strip above each mat, landscape
 * phones stack two small fans in the right column. Null when the hands are
 * hidden (ranked) or this is not a spectator.
 */
export function spectatorFans(revealed: boolean, wide: boolean, landscapePhone: boolean): SpectatorFans | null {
  if (!revealed) return null;
  if (!wide) return "portrait";
  return landscapePhone ? "landscape" : "desktop";
}

/** The far hand on a portrait phone: an overlapped strip up to `PHONE_FAN_MAX` cards, a scrolling row past that. */
export function spectatorFarStrip(count: number): "fan" | "scroll" {
  return count <= PHONE_FAN_MAX ? "fan" : "scroll";
}

/** Share of a card each card adds in a spectator's fans: just past 1, so cards sit side by side with a sliver of gap. */
export const SPECTATOR_FAN_SPREAD = 1.08;
