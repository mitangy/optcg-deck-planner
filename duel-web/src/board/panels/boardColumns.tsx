import type { CSSProperties, ReactNode, RefObject } from "react";
import type { PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { CardPreviewPanel } from "../preview/CardPreviewPanel";
import { HandLabel } from "../hand/HandLabel";
import type { spectatorFans } from "../hand/handLayout";
import { BattleLogPanel } from "./BattleLogPanel";
import type { BattleLogEntry } from "../match/battleLog";
import { seatLabel } from "../match/playerNames";
import type { seatClockLabels } from "../match/useMatchClocks";
import { OppHandFan, TurnStatusPanel } from "./TurnStatusPanel";
import { PANEL_LABELS, collapsedColumns, type PanelColumn, type PanelId, type PanelLayout } from "./panelLayout";
import { SidePanel } from "./SidePanels";
import type { useBoardPanels } from "./useBoardPanels";
import type { usePhoneResize } from "./usePhoneResize";

export type SidePanelsInput = {
  prefs: DuelSettings;
  previewPopup: boolean;
  battleLog: BattleLogEntry[];
  spectating: boolean;
  mySeat: Seat | null;
  oppHandOnMat: DuelSettings["oppHandSpot"] | null;
  specFans: ReturnType<typeof spectatorFans>;
  opp: PlayerView["opponent"];
  oppCardBackUrl: string | null;
  shownFarHand: React.ComponentProps<typeof OppHandFan>["cards"];
  oppSeat: Seat;
  view: PlayerView;
  boardSeat: Seat;
  firstSeat: Seat;
  players: SeatPlayers | null;
  turnClock: string | null;
  matchClock: string | null;
  seatClocks: ReturnType<typeof seatClockLabels>;
  railHand: boolean;
  nearHand: NonNullable<PlayerView["revealedHands"]>[Seat] | undefined;
  handCount: number;
  handRowRef: RefObject<HTMLDivElement | null>;
  renderHandCards: (fanned?: boolean) => ReactNode;
  handTucked: boolean;
  sortHandBtn: ReactNode;
  chatPanel: ReactNode;
  logPoseSide: ReturnType<typeof useBoardPanels>["logPoseSide"];
  setLogPoseHostL: ReturnType<typeof useBoardPanels>["setLogPoseHostL"];
  setLogPoseHostR: ReturnType<typeof useBoardPanels>["setLogPoseHostR"];
};

// The content of each side panel; a null entry is a panel with nothing to show.
export function buildSidePanels({
  prefs,
  previewPopup,
  battleLog,
  spectating,
  mySeat,
  oppHandOnMat,
  specFans,
  opp,
  oppCardBackUrl,
  shownFarHand,
  oppSeat,
  view,
  boardSeat,
  firstSeat,
  players,
  turnClock,
  matchClock,
  seatClocks,
  railHand,
  nearHand,
  handCount,
  handRowRef,
  renderHandCards,
  handTucked,
  sortHandBtn,
  chatPanel,
  logPoseSide,
  setLogPoseHostL,
  setLogPoseHostR
}: SidePanelsInput): Record<PanelId, ReactNode> {
  const sidePanels: Record<PanelId, ReactNode> = {
    preview: prefs.showCardPreview && !previewPopup ? <CardPreviewPanel /> : null,
    log: (
      <BattleLogPanel
        entries={battleLog}
        viewingSeat={spectating || mySeat == null ? undefined : mySeat}
        alwaysOpen
      />
    ),
    oppHand: oppHandOnMat || specFans === "desktop" ? null : (
      <OppHandFan
        count={opp.handCount}
        cardBackUrl={oppCardBackUrl}
        cards={shownFarHand}
        ownerSeat={oppSeat}
      />
    ),
    turn: (
      <TurnStatusPanel
        view={view}
        boardSeat={boardSeat}
        firstSeat={firstSeat}
        players={players}
        spectating={spectating}
        turnClock={turnClock}
        matchClock={matchClock}
        seatClocks={seatClocks}
      />
    ),
    hand: railHand && specFans === "landscape" && nearHand ? (
      <section className="rail-hand rail-hand-spec" aria-label={`${seatLabel(players, boardSeat)} hand: ${handCount} cards`}>
        <HandLabel name={seatLabel(players, boardSeat)} count={handCount} />
        <div className="hand-row hand-row-spec-grid" ref={handRowRef}>
          <div className="hand-row-inner">{renderHandCards()}</div>
        </div>
      </section>
    ) : railHand ? (
      <section
        className={`rail-hand${handTucked ? " is-dragging" : ""}`}
        aria-label={`Your hand: ${handCount} cards`}
      >
        <div className="rail-hand-head">
          <span className="rail-hand-title">{spectating ? "Seat hand" : "Hand"}</span>
          <span className="hand-rail-count">{handCount}</span>
          {!spectating ? (
            sortHandBtn
          ) : null}
        </div>
        <div className="rail-hand-cards" ref={handRowRef}>
          {renderHandCards()}
        </div>
      </section>
    ) : null,
    chat: chatPanel,
    logpose: logPoseSide ? (
      <div ref={logPoseSide === "left" ? setLogPoseHostL : setLogPoseHostR} className="lp-dock-host" data-panel-host="logpose" />
    ) : null,
  };
  return sidePanels;
}

export type ColumnGeometryInput = {
  prefs: DuelSettings;
  spectating: boolean;
  wide: boolean;
  lp: boolean;
  compactHud: boolean;
  panelLayout: PanelLayout;
  sidePanels: Record<PanelId, ReactNode>;
  panelDrag: ReturnType<typeof useBoardPanels>["panelDrag"];
  panelResize: ReturnType<typeof useBoardPanels>["panelResize"];
  phoneResize: ReturnType<typeof usePhoneResize>;
  singleSide: PanelColumn | null;
  railDefend: boolean;
  defendTray: ReactNode;
};

// Which side columns exist, which panels they hold and the CSS variables that size the arena.
export function columnGeometry({
  prefs,
  spectating,
  wide,
  lp,
  panelLayout,
  sidePanels,
  panelDrag,
  singleSide,
  railDefend,
  defendTray,
  compactHud,
  panelResize,
  phoneResize
}: ColumnGeometryInput) {
  const shownPanels: Record<PanelColumn, PanelId[]> = {
    left: panelLayout.left.filter((id) => sidePanels[id] != null),
    right: panelLayout.right.filter((id) => sidePanels[id] != null),
  };
  const bigBoard = prefs.bigBoard || (spectating && lp);
  const defendCol: PanelColumn = singleSide ?? "right";
  const collapsed = collapsedColumns(shownPanels, panelDrag.draggingId != null && !singleSide, {
    [defendCol]: railDefend && defendTray != null,
  });
  const noTopBar = bigBoard && wide && !lp && !compactHud;
  const idleCollapsed = collapsedColumns(shownPanels, false, { [defendCol]: railDefend && defendTray != null });
  const actionsSide: PanelColumn | null = !noTopBar ? null : idleCollapsed.right && !idleCollapsed.left ? "left" : "right";
  const noLeftCol = wide && !lp && collapsed.left && actionsSide !== "left";
  const noRightCol = wide && !lp && collapsed.right && actionsSide !== "right";
  const cutColumns: Record<PanelColumn, boolean> = {
    left: wide && !lp && !noLeftCol && singleSide !== "right",
    right: wide && !lp && !noRightCol && singleSide !== "left",
  };
  const shownCuts = {
    left: cutColumns.left ? panelResize.shown.cuts.left : undefined,
    right: cutColumns.right ? panelResize.shown.cuts.right : undefined,
  };
  const arenaStyle: CSSProperties | undefined =
    wide && !lp
      ? ({
          ...panelResize.arenaStyle(shownPanels, cutColumns),
          ...(singleSide === "left" && panelResize.shown.widths.left == null
            ? { "--left-w": bigBoard ? "clamp(250px, 17vw, 330px)" : "clamp(260px, 22vw, 400px)" }
            : null),
          ...(noLeftCol ? { "--left-w": "0px" } : null),
          ...(noRightCol ? { "--rail-w": "0px" } : null),
        } as CSSProperties)
      : lp
        ? phoneResize.style
        : undefined;
  return { shownPanels, bigBoard, defendCol, noTopBar, actionsSide, noLeftCol, noRightCol, cutColumns, shownCuts, arenaStyle };
}

export type ColumnPanelsInput = {
  shownPanels: Record<PanelColumn, PanelId[]>;
  sidePanels: Record<PanelId, ReactNode>;
  panelResize: ReturnType<typeof useBoardPanels>["panelResize"];
  panelDrag: ReturnType<typeof useBoardPanels>["panelDrag"];
  prefs: DuelSettings;
  defendCol: PanelColumn;
  railDefend: boolean;
  defendTray: ReactNode;
};

// The panels of one side column, with the Defend tray spliced in under the turn panel.
export function renderColumnPanelsFor({
  shownPanels,
  sidePanels,
  panelResize,
  panelDrag,
  prefs,
  defendCol,
  railDefend,
  defendTray
}: ColumnPanelsInput) {
  function renderColumnPanels(column: PanelColumn) {
    const ids = shownPanels[column];
    const sized = ids.some((id) => panelResize.shown.heights[id] != null);
    const panels = ids.map((id, i) =>
      renderSidePanel(id, i > 0 ? ids[i - 1]! : null, i === ids.length - 1, sized),
    );
    const after = ids.indexOf("turn") + 1;
    if (column === defendCol && railDefend && defendTray) {
      panels.splice(
        after,
        0,
        <div key="defend" className="board-panel" data-panel="defend">
          {defendTray}
        </div>,
      );
    }
    return panels;
  }
  function renderSidePanel(id: PanelId, above: PanelId | null, last: boolean, columnSized: boolean) {
    const el = sidePanels[id];
    if (el == null) return null;
    return (
      <SidePanel
        key={id}
        id={id}
        dragging={panelDrag.draggingId === id}
        grip={prefs.layoutGrips ? panelDrag.gripProps(id) : null}
        divider={
          prefs.layoutGrips && above
            ? panelResize.dividerProps(above, id, `${PANEL_LABELS[above]} and ${PANEL_LABELS[id]}`)
            : null
        }
        style={panelResize.panelStyle(id, last, columnSized)}
      >
        {el}
      </SidePanel>
    );
  }
  return renderColumnPanels;
}
