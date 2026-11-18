import type { DuelSettings } from "../../settings";
import { resolveHandLayout } from "../../settings";
import { usesSidewaysFan } from "../hand/handLayout";
import {
  COMPACT_HUD_QUERY,
  LANDSCAPE_PHONE_QUERY,
  PORTRAIT_MAT_QUERY,
  RAIL_HAND_QUERY,
  SIDEWAYS_FAN_QUERY,
  TILT_BOARD_QUERY,
  WIDE_BOARD_QUERY,
  useMediaQuery,
} from "./useMediaQuery";

export function useBoardLayout(prefs: DuelSettings, isReplay: boolean) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const compactHud = useMediaQuery(COMPACT_HUD_QUERY);
  const portraitMat = useMediaQuery(PORTRAIT_MAT_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const simpleOwnBoard = prefs.compactOwnBoard && portraitMat;
  const lp = wide && landscapePhone;
  const railHandTall = useMediaQuery(RAIL_HAND_QUERY);
  const resolvedHandLayout = resolveHandLayout(prefs.handLayout, wide && !lp && railHandTall);
  const lpFan = usesSidewaysFan(lp, useMediaQuery(SIDEWAYS_FAN_QUERY), prefs.handLayout);
  const handLayout = isReplay && resolvedHandLayout === "grid" ? "fan" : resolvedHandLayout;
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  const tilted = wide && !lp && tiltFits && prefs.tiltedBoard;
  return { wide, compactHud, portraitMat, simpleOwnBoard, lp, lpFan, railHandTall, handLayout, tilted };
}
