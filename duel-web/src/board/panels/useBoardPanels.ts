import { useEffect, useMemo, useState, type RefObject } from "react";
import { fitDock, useLogPoseDock, useLogPoseDockHost } from "@optcg/analyst-client";
import { updateSettings, type DuelSettings } from "../../settings";
import type { DragPayload } from "../combat/dragIntents";
import type { LandscapePanel } from "../layout/LandscapeRail";
import { columnOf, mergeIntoColumn, parsePanelLayout, placeLogPose, serializePanelLayout, splitMergedLayout, type PanelColumn } from "./panelLayout";
import { panelSizesForMode, panelSizesPatch } from "./panelSizes";
import { usePanelDrag } from "./SidePanels";
import { usePanelResize } from "./usePanelResize";

export function useBoardPanels({
  prefs,
  wide,
  lp,
  dragPayload,
  arenaBodyRef,
}: {
  prefs: DuelSettings;
  wide: boolean;
  lp: boolean;
  dragPayload: DragPayload | null;
  arenaBodyRef: RefObject<HTMLDivElement | null>;
}) {
  const logPoseDock = useLogPoseDock();
  const [logPoseHostL, setLogPoseHostL] = useState<HTMLElement | null>(null);
  const [logPoseHostR, setLogPoseHostR] = useState<HTMLElement | null>(null);
  const singleSide: PanelColumn | null = wide && !lp && prefs.sideColumns !== "both" ? prefs.sideColumns : null;
  const logPoseSides = useMemo(() => ({ left: singleSide !== "right", right: singleSide !== "left" }), [singleSide]);
  useLogPoseDockHost(wide && !lp, logPoseHostL, logPoseHostR, logPoseSides);
  // The same fit the panel uses (fitDock), so the host the board renders is the one the panel looks for.
  const logPoseSide = wide && !lp && logPoseDock.open ? fitDock(logPoseDock.dock, logPoseSides) : null;
  const savedPanelLayout = useMemo(() => placeLogPose(parsePanelLayout(prefs.panelLayout), logPoseSide), [prefs.panelLayout, logPoseSide]);
  const panelLayout = useMemo(
    () => (singleSide ? mergeIntoColumn(savedPanelLayout, singleSide) : savedPanelLayout),
    [savedPanelLayout, singleSide],
  );
  const panelDrag = usePanelDrag(
    arenaBodyRef,
    panelLayout,
    (next) => {
      updateSettings({
        panelLayout: serializePanelLayout(singleSide ? splitMergedLayout(next, savedPanelLayout, singleSide, logPoseSide === singleSide ? "logpose" : undefined) : next),
      });
      // Log Pose dragged to the other column (both shown): the dock side follows, so the two agree.
      if (!singleSide && logPoseSide) {
        const col = columnOf(next, "logpose");
        if (col !== logPoseSide) logPoseDock.setDock(col);
      }
    },
    {
      id: "oppHand",
      spot: prefs.oppHandSpot || null,
      onChange: (spot) => updateSettings({ oppHandSpot: spot ?? "" }),
    },
  );
  const panelSizes = useMemo(
    () => panelSizesForMode(prefs.bigBoard, prefs.panelSizes, prefs.panelSizesBig),
    [prefs.bigBoard, prefs.panelSizes, prefs.panelSizesBig],
  );
  const panelResize = usePanelResize(
    arenaBodyRef,
    panelSizes,
    (next) => updateSettings(panelSizesPatch(prefs.bigBoard, next, prefs.panelSizes)),
  );
  const [lpPanel, setLpPanel] = useState<LandscapePanel | null>(null);
  useEffect(() => {
    if (dragPayload || !lp) setLpPanel(null);
  }, [dragPayload, lp]);

  return { singleSide, logPoseSide, setLogPoseHostL, setLogPoseHostR, panelLayout, panelDrag, panelResize, lpPanel, setLpPanel };
}
