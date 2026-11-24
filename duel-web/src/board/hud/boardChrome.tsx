import type { ReactNode } from "react";
import type { Seat, SeatPlayers, SeatSkin, PlayerView } from "../../net/protocol";
import { openFeedback } from "../../feedbackDialog";
import { openReport } from "../../reports/reportDialog";
import { matchReportTarget } from "../../reports/reportTargets";
import { MatchMenu } from "../match/MatchMenu";
import { matchMenuItems } from "../match/matchMenuItems";
import { seatLabel, seatName } from "../match/playerNames";
import type { UndoUi } from "../match/undoHud";
import type { ArtToggle } from "../prompts/HideArtItems";
import type { useBoardAudio } from "../audio/useBoardAudio";
import { BoardHud, type BoardHudProps } from "./BoardHud";

export type BoardChromeInput = {
  view: PlayerView;
  players: SeatPlayers | null;
  matchId: string | null;
  boardSeat: Seat;
  oppSeat: Seat;
  mySeat: Seat | null;
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  yourTurn: boolean;
  oppActive: boolean;
  mulliganPhase: boolean;
  decidingMulligan: boolean;
  youFirst: boolean;
  orderLabel: string;
  turnClock: BoardHudProps["turnClock"];
  matchClock: BoardHudProps["matchClock"];
  seatClocks: BoardHudProps["seatClocks"];
  logPoseButton: ReactNode;
  undoUi: UndoUi;
  compactHud: boolean;
  hotseatPass: BoardHudProps["hotseatPass"];
  tabMute: ReturnType<typeof useBoardAudio>["tabMute"];
  tabMuteText: ReturnType<typeof useBoardAudio>["tabMuteText"];
  fullscreenOffered: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  setSettingsOpen: (open: boolean) => void;
  onConcede: (() => void) | undefined;
  leaveLabel: string;
  onLeave: () => void;
  canReport: boolean;
  seatSkins: readonly [SeatSkin | null, SeatSkin | null] | undefined;
  artToggles: ArtToggle[];
  toggleHiddenArt: (seat: Seat) => void;
};

// The match menu, the HUD bars and the report handlers that share the same inputs.
export function boardChrome({
  view,
  players,
  matchId,
  boardSeat,
  oppSeat,
  spectating,
  isReplay,
  over,
  yourTurn,
  oppActive,
  mulliganPhase,
  decidingMulligan,
  youFirst,
  orderLabel,
  turnClock,
  matchClock,
  seatClocks,
  logPoseButton,
  undoUi,
  compactHud,
  hotseatPass,
  tabMute,
  tabMuteText,
  fullscreenOffered,
  isFullscreen,
  toggleFullscreen,
  setSettingsOpen,
  onConcede,
  leaveLabel,
  onLeave,
  canReport,
  mySeat,
  seatSkins,
  artToggles,
  toggleHiddenArt,
}: BoardChromeInput) {
  const { undoPendingTheirs, undoNothingYet } = undoUi;
  const reportProblem = () => openFeedback("Report a problem");
  const reportTargetFor = (source: "match" | "spectate" | "postmatch") =>
    canReport && !isReplay && !hotseatPass
      ? matchReportTarget({ source, matchId, spectating, mySeat, players, seatSkins })
      : null;
  const canReportPlayer = reportTargetFor("match") !== null;
  const reportPlayer = () => {
    const target = reportTargetFor(spectating ? "spectate" : "match");
    if (target) openReport(target);
  };
  const matchMenuEl = (placement: "top" | "left" | "anchor") => (
    <MatchMenu
      placement={placement}
      items={matchMenuItems({
        spectating,
        over,
        hotseat: Boolean(hotseatPass),
        fullscreenOffered,
        fullscreenInBar: placement === "anchor",
        muteInBar: placement === "anchor",
        canConcede: Boolean(onConcede),
        replay: isReplay,
        canReportPlayer,
        hideArtOffered: artToggles.length > 0,
      })}
      artToggles={artToggles}
      onToggleArt={toggleHiddenArt}
      info={{
        matchup: players
          ? `${spectating ? seatLabel(players, 0) : seatName(players, boardSeat) ?? "You"} vs ${seatLabel(
              players,
              spectating ? 1 : oppSeat,
            )}`
          : null,
        seat: isReplay ? "Replay" : spectating ? "Spectating" : null,
        order: orderLabel,
      }}
      roomId={matchId}
      isFullscreen={isFullscreen}
      tabMute={{ silenced: tabMute.silenced, label: tabMuteText.label, title: tabMuteText.title, onToggle: tabMute.toggle }}
      leaveLabel={leaveLabel}
      onSettings={() => setSettingsOpen(true)}
      onToggleFullscreen={toggleFullscreen}
      onReport={reportProblem}
      onReportPlayer={reportPlayer}
      onConcede={() => onConcede?.()}
      onLeave={onLeave}
    />
  );

  const hudProps = {
    view,
    players,
    matchId,
    boardSeat,
    oppSeat,
    spectating,
    isReplay,
    over,
    yourTurn,
    oppActive,
    mulliganPhase,
    decidingMulligan,
    youFirst,
    orderLabel,
    turnClock,
    matchClock,
    seatClocks,
    logPoseButton,
    matchMenu: matchMenuEl,
    undoUi,
    undoHidden: undoPendingTheirs || (compactHud && undoNothingYet),
    hotseatPass,
    tabMute,
    tabMuteText,
    fullscreenOffered,
    isFullscreen,
    onToggleFullscreen: toggleFullscreen,
    onSettings: () => setSettingsOpen(true),
    onReportProblem: reportProblem,
    canReportPlayer,
    onReportPlayer: reportPlayer,
    onConcede,
    leaveLabel,
    onLeave,
  };
  const columnActions = <BoardHud variant="column" {...hudProps} />;
  return { hudProps, matchMenuEl, columnActions, reportTargetFor, canReportPlayer };
}
