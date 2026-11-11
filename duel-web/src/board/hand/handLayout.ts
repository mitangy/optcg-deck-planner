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
 * Sideways tablets and foldables showing the fan (`fanHand`) leave the column to the rest.
 */
export function usesRailHand(wide: boolean, landscapePhone: boolean, tall: boolean, fanHand: boolean): boolean {
  return wide && !fanHand && (landscapePhone || tall);
}

/**
 * Sideways tablets, unfolded foldables (iPhone Duo) and big phones (`tallEnough`, 500px+ tall) fan the hand
 * off the bottom of the board, but only when Fan is picked: Automatic and Grid keep it in the right column,
 * which has room for it there (like Automatic on a tall desktop window). Shorter phones always keep the column.
 */
export function usesSidewaysFan(landscapePhone: boolean, tallEnough: boolean, handLayoutPref: string): boolean {
  return landscapePhone && tallEnough && handLayoutPref === "fan";
}

/**
 * The fanned hand off the bottom of the board. Desktop windows: unless Grid is picked (spectators of
 * unranked rooms always get the two fans). Sideways (`landscapePhone`): only when the screen is tall
 * enough and Fan is picked (`sidewaysFan`); spectators there keep the right column's grids.
 */
export function usesWideFan(
  wide: boolean,
  landscapePhone: boolean,
  sidewaysFan: boolean,
  specFans: SpectatorFans | null,
  handLayout: string,
): boolean {
  if (!wide) return false;
  if (landscapePhone) return sidewaysFan && specFans == null;
  return specFans != null || handLayout !== "grid";
}

/** Where a spectator of an unranked room sees both hands (fans on desktop, compact grids on phones). */
export type SpectatorFans = "desktop" | "portrait" | "landscape";

/**
 * Spectators of unranked rooms get both hands face up. They have nothing to
 * play, so both are drawn whatever their Hand setting says (the saved setting
 * is left alone): the desktop fans are the match's hand fan, the far one
 * mirrored along the top edge of the board; phones get compact grids (see `spectatorHandGrid`): a row above the
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
 * desktop keeps the two fans (the match's `HandFan`).
 */
export function spectatorHandGrid(fans: SpectatorFans | null): boolean {
  return fans === "portrait" || fans === "landscape";
}
