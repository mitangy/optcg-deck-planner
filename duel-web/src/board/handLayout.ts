/**
 * Portrait phones draw your hand as an overlapped fan whenever the Hand setting
 * is not Grid, whatever its size: a big hand overlaps more (the cards' margins
 * in board.css) rather than silently turning into the scrolling Grid (#445).
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

/** Where a spectator of an unranked room sees both hands (fans on desktop, compact grids on phones). */
export type SpectatorFans = "desktop" | "portrait" | "landscape";

/**
 * Spectators of unranked rooms get both hands face up. They have nothing to
 * play, so both are drawn whatever their Hand setting says (the saved setting
 * is left alone): the desktop fans hang off the top and bottom edges of the
 * board; phones get compact grids (see `spectatorHandGrid`): a row above the
 * top mat and one under the bottom mat in portrait, two wrapping grids in the
 * right column in landscape. Null when the hands are hidden (ranked) or this
 * is not a spectator.
 */
export function spectatorFans(revealed: boolean, wide: boolean, landscapePhone: boolean): SpectatorFans | null {
  if (!revealed) return null;
  if (!wide) return "portrait";
  return landscapePhone ? "landscape" : "desktop";
}

/**
 * Phones show a spectator's hands as grids of small upright cards side by side
 * (no overlap, tilt or drop) so the freed height goes to the mats; only the
 * desktop keeps the two fans.
 */
export function spectatorHandGrid(fans: SpectatorFans | null): boolean {
  return fans === "portrait" || fans === "landscape";
}

/** Share of a card each card adds in a spectator's fans: just past 1, so cards sit side by side with a sliver of gap. */
export const SPECTATOR_FAN_SPREAD = 1.08;
