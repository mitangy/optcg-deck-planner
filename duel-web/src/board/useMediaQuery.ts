import { useEffect, useState } from "react";

/** Live `matchMedia` result (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Landscape phones (short), unfolded foldables and small landscape windows (480-899px wide). */
const LANDSCAPE_RAIL_SHORT = "(orientation: landscape) and (min-width: 480px) and (max-height: 499px)";
const LANDSCAPE_RAIL_NARROW = "(orientation: landscape) and (min-width: 480px) and (max-width: 899px)";
/** Touch tablets and big foldables held sideways: the desktop side columns would shrink the mats. */
const LANDSCAPE_RAIL_TOUCH_TABLET =
  "(orientation: landscape) and (pointer: coarse) and (min-width: 900px) and (max-width: 1099px)";

/** Desktop window: >=900x500, minus touch devices held sideways up to 1099px wide (those use the rail layout). */
const DESKTOP =
  "(min-width: 900px) and (min-height: 500px) and (not ((orientation: landscape) and (pointer: coarse) and (max-width: 1099px)))";

/**
 * Landscape rail layout ("lp"): the wide board with the short-viewport layout (side rail, corner hand
 * dock). Landscape phones, unfolded foldables and small touch tablets held sideways. Must be the exact
 * complement of {@link DESKTOP_BOARD_QUERY} on wide boards; mirrors the three-branch @media list in board.css.
 */
export const LANDSCAPE_PHONE_QUERY = [LANDSCAPE_RAIL_SHORT, LANDSCAPE_RAIL_NARROW, LANDSCAPE_RAIL_TOUCH_TABLET].join(", ");

/**
 * Wide board: side panels + fixed hand dock. Must match the rail breakpoint
 * in board.css (desktop, or landscape phones, foldables and small touch tablets).
 */
export const WIDE_BOARD_QUERY = `${DESKTOP}, ${LANDSCAPE_PHONE_QUERY}`;

/**
 * Compact HUD: everything except a real desktop window. Phones, foldables and small touch tablets
 * in either orientation get the one-row bar with a match menu.
 */
export const COMPACT_HUD_QUERY = `not (${DESKTOP})`;

/** Portrait phones / tablets: must match the 6-column mat block in board.css. */
export const PORTRAIT_MAT_QUERY = "(max-width: 899px) and (orientation: portrait)";

/**
 * Tilted board (setting): landscape desktop windows only. Phones, foldables and small touch tablets
 * keep the flat board, and on tall windows the tilted mats get long and thin with small cards.
 */
export const TILT_BOARD_QUERY = `${DESKTOP} and (orientation: landscape)`;

/** Desktop windows: the wide board minus the landscape rail layout, where side panels can be moved. */
export const DESKTOP_BOARD_QUERY = DESKTOP;

/**
 * Tall desktop windows: the hand is an always-open grid in the right rail
 * instead of the fixed corner dock. Only meaningful on the wide board and not
 * on landscape phones (`wide && !lp`); shorter windows (150% zoom) keep the dock.
 */
export const RAIL_HAND_QUERY = "(min-height: 680px)";

/**
 * Decks page and deck editor desktop layout (side-by-side lists, card search
 * beside the deck). Must match the 1024px blocks in styles.css; phones and
 * small tablets keep the single column.
 */
export const DESKTOP_DECKS_QUERY = "(min-width: 1024px)";

/** A mouse or trackpad is the main pointer (a desktop or laptop), so phone-only settings stay hidden. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
