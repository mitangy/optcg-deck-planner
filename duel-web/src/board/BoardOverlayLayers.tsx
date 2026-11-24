import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat, SeatPlayers } from "../net/protocol";
import type { DuelSettings } from "../settings";
import { lookupCard } from "../cards/atlas";
import { AttackIndicator, DragAttackArrow } from "./combat/AttackIndicator";
import { AttackWarning, type AttackWarn } from "./combat/AttackWarning";
import type { DragPayload } from "./combat/dragIntents";
import type { useDefendFlow } from "./combat/useDefendFlow";
import type { useBoardAudio } from "./audio/useBoardAudio";
import { CardActionPopover, DonAttachConfirm, DragGhost, type CardActionButton } from "./BoardOverlays";
import type { PendingAttach } from "./don/donSelection";
import type { dockIntents } from "./prompts/primaryIntent";
import type { describeMatchResult } from "./match/matchResult";
import { MatchResultView, type BoardRematch } from "./match/MatchResultView";
import type { LoadMatchRecord } from "./match/MatchOverFacts";
import { BoardMotion } from "./motion/BoardMotion";
import { RevealOverlay } from "./motion/RevealOverlay";
import { TurnSplash } from "./motion/TurnSplash";
import { CardSpotlightLayer } from "./preview/CardSpotlight";
import { PendingChoicePrompt } from "./prompts/PendingChoicePrompt";
import { PrimaryDock } from "./prompts/PrimaryDock";
import { promptOpenFor } from "./prompts/promptHide";
import { endTurnWarning } from "./settings/gameplayPrefs";

type PromptProps = React.ComponentProps<typeof PendingChoicePrompt>;
type Audio = ReturnType<typeof useBoardAudio>;

export type BoardOverlayLayersProps = {
  view: PlayerView;
  prefs: DuelSettings;
  intents: Intent[];
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  wide: boolean;
  lp: boolean;
  mySeat: Seat | null;
  boardSeat: Seat;
  players: SeatPlayers | null;
  matchId: string | null;
  hotseatPass: { otherSeat: Seat; onPass: () => void } | undefined;
  floatingPrompts: boolean;
  replaceOpen: boolean;
  replaceCardId: PromptProps["replaceCardId"];
  replaceHandIndex: PromptProps["replaceHandIndex"];
  setReplaceCardId: PromptProps["setReplaceCardId"];
  handConfirm: PromptProps["handConfirm"];
  hiddenChoiceId: PromptProps["hiddenChoiceId"];
  setHiddenChoiceId: PromptProps["setHiddenChoiceId"];
  promptBattle: PromptProps["promptBattle"];
  onSendIntent: (intent: Intent) => void;
  clearSelection: () => void;
  replay: { controls: ReactNode; quiet: boolean } | undefined;
  docked: boolean;
  dock: ReturnType<typeof dockIntents>;
  cardIntentCount: number;
  oppWait: React.ComponentProps<typeof PrimaryDock>["waiting"];
  defendPrimary: ReturnType<typeof useDefendFlow>["defendPrimary"];
  counterLabel: ReturnType<typeof useDefendFlow>["counterLabel"];
  sendPrimary: (intent: Intent) => void;
  splash: React.ComponentProps<typeof TurnSplash>["message"];
  attackWarn: AttackWarn | null;
  reveals: Audio["reveals"];
  spotlights: Audio["spotlights"];
  previewOppSeat: React.ComponentProps<typeof RevealOverlay>["oppSeat"];
  ghostPayload: React.ComponentProps<typeof DragGhost>["payload"];
  dragPayload: DragPayload | null;
  popoverOpen: boolean;
  anchorCard: { id: string; defId: string } | null;
  popoverActions: CardActionButton[];
  handFilter: number | null;
  quickCounts: number[];
  quickAttach: (count: number) => void;
  pendingAttach: PendingAttach | null;
  dndEnabled: boolean;
  pendingAttachName: string;
  confirmAttach: (pending?: PendingAttach) => void;
  clearDonSelection: () => void;
  resultHidden: boolean;
  setResultHidden: Dispatch<SetStateAction<boolean>>;
  result: ReturnType<typeof describeMatchResult>;
  matchOver: MatchOverMessage["result"] | null;
  loadMatchRecord: LoadMatchRecord | undefined;
  rematch: BoardRematch | undefined;
  canReportPlayer: boolean;
  reportTargetFor: React.ComponentProps<typeof MatchResultView>["reportTargetFor"];
  onLeave: () => void;
  onBackToTournament?: () => void;
};

// Prompts, the action dock, banners, drag visuals, the card popover and the match result over the board.
export function BoardOverlayLayers({
  view,
  prefs,
  intents,
  spectating,
  isReplay,
  over,
  wide,
  lp,
  mySeat,
  boardSeat,
  players,
  matchId,
  hotseatPass,
  floatingPrompts,
  replaceOpen,
  replaceCardId,
  replaceHandIndex,
  setReplaceCardId,
  handConfirm,
  hiddenChoiceId,
  setHiddenChoiceId,
  promptBattle,
  onSendIntent,
  clearSelection,
  replay,
  docked,
  dock,
  cardIntentCount,
  oppWait,
  defendPrimary,
  counterLabel,
  sendPrimary,
  splash,
  attackWarn,
  reveals,
  spotlights,
  previewOppSeat,
  ghostPayload,
  dragPayload,
  popoverOpen,
  anchorCard,
  popoverActions,
  handFilter,
  quickCounts,
  quickAttach,
  pendingAttach,
  dndEnabled,
  pendingAttachName,
  confirmAttach,
  clearDonSelection,
  resultHidden,
  setResultHidden,
  result,
  matchOver,
  loadMatchRecord,
  rematch,
  canReportPlayer,
  reportTargetFor,
  onLeave,
  onBackToTournament,
}: BoardOverlayLayersProps) {
  return (
    <>
  <PendingChoicePrompt
    view={view}
    intents={intents}
    spectating={spectating}
    mySeat={mySeat}
    hotseatPass={Boolean(hotseatPass)}
    floatingPrompts={floatingPrompts}
    replaceOpen={replaceOpen}
    replaceCardId={replaceCardId}
    replaceHandIndex={replaceHandIndex}
    setReplaceCardId={setReplaceCardId}
    handConfirm={handConfirm}
    hiddenChoiceId={hiddenChoiceId}
    setHiddenChoiceId={setHiddenChoiceId}
    promptBattle={promptBattle}
    wide={wide}
    lp={lp}
    onSendIntent={onSendIntent}
    onSendClearing={(intent) => {
      clearSelection();
      onSendIntent(intent);
    }}
  />

  {replay && wide && !lp ? <div className="replay-dock">{replay.controls}</div> : null}

  {docked ? (
    <PrimaryDock
      primary={dock.primary}
      extras={dock.extras}
      keyOffset={cardIntentCount}
      waiting={oppWait}
      view={view}
      disabled={over}
      confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
      defend={defendPrimary}
      counterLabel={counterLabel}
      onSend={sendPrimary}
    />
  ) : null}

  <TurnSplash message={splash} />
  <AttackWarning warn={prefs.cantAttackWarning ? attackWarn : null} />
  <RevealOverlay
    reveal={reveals.current}
    waiting={reveals.waiting}
    oppSeat={previewOppSeat}
    onDismiss={reveals.dismiss}
  />
  <AttackIndicator
    view={over || !prefs.battleArrow ? null : view}
    dimmed={promptOpenFor(view.pendingChoices?.[0], spectating ? null : mySeat, hiddenChoiceId)}
  />
  <BoardMotion view={view} />
  <CardSpotlightLayer
    batch={spotlights.current}
    waiting={spotlights.waiting}
    oppSeat={previewOppSeat}
    onDone={spotlights.done}
  />
  <DragGhost payload={ghostPayload} />
  <DragAttackArrow attackerId={dragPayload?.type === "attack" ? dragPayload.attackerId : null} />
  {popoverOpen && anchorCard ? (
    <CardActionPopover
      anchorId={anchorCard.id}
      cardName={lookupCard(anchorCard.defId).name}
      actions={popoverActions}
      donCounts={handFilter == null ? quickCounts : []}
      onDon={quickAttach}
    />
  ) : null}
  {pendingAttach && dndEnabled ? (
    <DonAttachConfirm
      pending={pendingAttach}
      targetName={pendingAttachName}
      onConfirm={() => confirmAttach()}
      onCancel={clearDonSelection}
    />
  ) : null}

  <MatchResultView
    over={over}
    resultHidden={resultHidden}
    setResultHidden={setResultHidden}
    result={result}
    isReplay={isReplay}
    wide={wide}
    lp={lp}
    matchOver={matchOver}
    view={view}
    spectating={spectating}
    players={players}
    matchId={matchId}
    loadMatchRecord={loadMatchRecord}
    rematch={rematch}
    boardSeat={boardSeat}
    canReportPlayer={canReportPlayer}
    reportTargetFor={reportTargetFor}
    onLeave={onLeave}
    onBackToTournament={onBackToTournament}
  />
    </>
  );
}
