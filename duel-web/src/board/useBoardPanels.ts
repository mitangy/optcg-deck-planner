import { useEffect, useMemo, useState, type RefObject } from "react";
import { fitDock, useLogPoseDock, useLogPoseDockHost } from "@optcg/analyst-client";
import { updateSettings, type DuelSettings } from "../settings";
import type { DragPayload } from "./dragIntents";
import type { LandscapePanel } from "./LandscapeRail";
import { columnOf, mergeIntoColumn, parsePanelLayout, placeLogPose, serializePanelLayout, splitMergedLayout, type PanelColumn } from "./panelLayout";
import { panelSizesForMode, panelSizesPatch } from "./panelSizes";
import { usePanelDrag } from "./SidePanels";
import { usePanelResize } from "./usePanelResize";

/**
 * The desktop side columns: which panel sits in which column (dragged by its grip, saved in settings), their
 * widths and cut heights, the docked Log Pose host and the landscape phone's overlay panel.
 */
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
  // Log Pose docked to a side: its panel renders into a host that is a movable panel of that side column, only while it is open.
  // Narrow windows and landscape phones have no side columns, so there it floats.
  const logPoseDock = useLogPoseDock();
  const [logPoseHostL, setLogPoseHostL] = useState<HTMLElement | null>(null);
  const [logPoseHostR, setLogPoseHostR] = useState<HTMLElement | null>(null);
  /** Desktop with one combined side column (the `sideColumns` setting): its side, else null (two columns). */
  const singleSide: PanelColumn | null = wide && !lp && prefs.sideColumns !== "both" ? prefs.sideColumns : null;
  const logPoseSides = useMemo(() => ({ left: singleSide !== "right", right: singleSide !== "left" }), [singleSide]);
  useLogPoseDockHost(wide && !lp, logPoseHostL, logPoseHostR, logPoseSides);
  // The same fit the panel uses (fitDock), so the host the board renders is the one the panel looks for (#554).
  const logPoseSide = wide && !lp && logPoseDock.open ? fitDock(logPoseDock.dock, logPoseSides) : null;
  /** Desktop: which column each side panel sits in (dragged by its grip, saved in settings). */
  // One combined column folds the other column's panels in for display only; the saved layout keeps its split.
  // A docked Log Pose takes its slot in the column it is docked to (its saved place there, else the top).
  const savedPanelLayout = useMemo(() => placeLogPose(parsePanelLayout(prefs.panelLayout), logPoseSide), [prefs.panelLayout, logPoseSide]);
  const panelLayout = useMemo(
    () => (singleSide ? mergeIntoColumn(savedPanelLayout, singleSide) : savedPanelLayout),
    [savedPanelLayout, singleSide],
  );
  const panelDrag = usePanelDrag(
    arenaBodyRef,
    panelLayout,
    // A reorder in the one column is split back into the two saved columns (same counts), so Both still has two.
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
  // Bigger playing area keeps its own column widths (heights are shared), so its narrow columns stay narrow.
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
  // Starting a drag (or leaving landscape) must never leave an overlay over the board.
  useEffect(() => {
    if (dragPayload || !lp) setLpPanel(null);
  }, [dragPayload, lp]);

  return { singleSide, logPoseSide, setLogPoseHostL, setLogPoseHostR, panelLayout, panelDrag, panelResize, lpPanel, setLpPanel };
}
