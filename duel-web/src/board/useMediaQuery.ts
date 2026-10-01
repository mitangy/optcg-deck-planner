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

/**
 * Wide board: side panels + fixed hand dock. Must match the rail breakpoint
 * in board.css (desktop, or landscape phones).
 */
export const WIDE_BOARD_QUERY =
  "(min-width: 900px) and (min-height: 500px), (orientation: landscape) and (min-width: 600px) and (max-height: 499px)";

/**
 * Compact HUD: everything except a real desktop window (>=900x500). Phones in
 * either orientation get the one-row bar with a match menu.
 */
export const COMPACT_HUD_QUERY = "not ((min-width: 900px) and (min-height: 500px))";

/** Portrait phones / tablets: must match the 6-column mat block in board.css. */
export const PORTRAIT_MAT_QUERY = "(max-width: 899px) and (orientation: portrait)";

/**
 * Tilted board (setting): landscape desktop / tablet windows only. Phones keep
 * the flat board, and on tall windows the tilted mats get long and thin with
 * small cards.
 */
export const TILT_BOARD_QUERY =
  "(min-width: 900px) and (min-height: 500px) and (orientation: landscape)";

/** Landscape phones (the wide board with the short-viewport layout). */
export const LANDSCAPE_PHONE_QUERY =
  "(orientation: landscape) and (min-width: 600px) and (max-height: 499px)";

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
