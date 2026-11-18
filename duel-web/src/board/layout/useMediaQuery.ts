export { useMediaQuery } from "@optcg/ui/hooks";

const LANDSCAPE_RAIL_SHORT = "(orientation: landscape) and (min-width: 480px) and (max-height: 499px)";
const LANDSCAPE_RAIL_NARROW = "(orientation: landscape) and (min-width: 480px) and (max-width: 899px)";
const LANDSCAPE_RAIL_TOUCH_TABLET =
  "(orientation: landscape) and (pointer: coarse) and (min-width: 900px) and (max-width: 1099px)";

const DESKTOP =
  "(min-width: 900px) and (min-height: 500px) and (not ((orientation: landscape) and (pointer: coarse) and (max-width: 1099px)))";

export const LANDSCAPE_PHONE_QUERY = [LANDSCAPE_RAIL_SHORT, LANDSCAPE_RAIL_NARROW, LANDSCAPE_RAIL_TOUCH_TABLET].join(", ");

export const WIDE_BOARD_QUERY = `${DESKTOP}, ${LANDSCAPE_PHONE_QUERY}`;

export const COMPACT_HUD_QUERY = `not (${DESKTOP})`;

export const PORTRAIT_MAT_QUERY = "(max-width: 899px) and (orientation: portrait)";

export const TILT_BOARD_QUERY = `${DESKTOP} and (orientation: landscape)`;

export const DESKTOP_BOARD_QUERY = DESKTOP;

export const RAIL_HAND_QUERY = "(min-height: 680px)";

export const SIDEWAYS_FAN_QUERY = "(orientation: landscape) and (min-height: 500px), (orientation: portrait) and (min-width: 500px)";

export const DESKTOP_DECKS_QUERY = "(min-width: 1024px)";

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
