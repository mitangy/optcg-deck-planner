import type { DuelSettings } from "../../settings";
import { resolveHandLayout } from "../../settings";
import {
  COMPACT_HUD_QUERY,
  LANDSCAPE_PHONE_QUERY,
  PORTRAIT_MAT_QUERY,
  RAIL_HAND_QUERY,
  TILT_BOARD_QUERY,
  WIDE_BOARD_QUERY,
  useMediaQuery,
} from "./useMediaQuery";

/** The layout mode the window and the settings put the board in (the flags the rest of the board keys off). */
export function useBoardLayout(prefs: DuelSettings, isReplay: boolean) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const compactHud = useMediaQuery(COMPACT_HUD_QUERY);
  const portraitMat = useMediaQuery(PORTRAIT_MAT_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  /** "Simple board on phones": your own mat gets the count row and bigger cards the opponent's has (portrait only). */
  const simpleOwnBoard = prefs.compactOwnBoard && portraitMat;
  /** Landscape phone: icon rail + overlays on the left, slim action column on the right. */
  const lp = wide && landscapePhone;
  /** Tall desktop, Grid layout: the hand is an always-open grid side panel (no dock). */
  const railHandTall = useMediaQuery(RAIL_HAND_QUERY);
  /** "auto" (never chosen) is the Grid on a tall desktop window and the fan elsewhere. */
  const resolvedHandLayout = resolveHandLayout(prefs.handLayout, wide && !lp && railHandTall);
  /** A replay's controls take the right rail's free space, so its hand is the fan, never the rail's grid. */
  const handLayout = isReplay && resolvedHandLayout === "grid" ? "fan" : resolvedHandLayout;
  /** Desktop / landscape tablet: the board leans back in perspective, seen from your seat. */
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  const tilted = wide && !lp && tiltFits && prefs.tiltedBoard;
  return { wide, compactHud, portraitMat, simpleOwnBoard, lp, railHandTall, handLayout, tilted };
}
