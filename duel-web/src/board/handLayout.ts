/** Past this many cards the overlapped portrait fan is unreadable: the hand scrolls instead. */
export const PHONE_FAN_MAX = 8;

/** Portrait phones draw the hand as an overlapped fan, until it gets too big to read. */
export function usesPhoneFan(wide: boolean, handLayout: string, handCount: number): boolean {
  return !wide && handLayout !== "grid" && handCount <= PHONE_FAN_MAX;
}

/**
 * The hand lives in the right column (instead of a dock or fan) on landscape phones,
 * so it never covers the field, and on tall desktop windows using the Grid layout.
 */
export function usesRailHand(wide: boolean, landscapePhone: boolean, tall: boolean, fanHand: boolean): boolean {
  return wide && (landscapePhone || (tall && !fanHand));
}
