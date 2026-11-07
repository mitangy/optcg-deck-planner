import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ChatLine, Intent, MatchOverMessage, PlayerView, Seat, SeatPlayers, SeatSkin, TimerMessage } from "../net/protocol";
import { BattleLogPanel } from "./BattleLogPanel";
import { CardPreviewPanel } from "./CardPreviewPanel";
import { CardPreviewPopup } from "./CardPreviewPopup";
import { RecentPlaysStrip } from "./RecentPlaysStrip";
import { MatchViewerSeatContext } from "./artOwnership";
import { PromptSlotContext } from "./promptSlot";
import { ChatPanel } from "./ChatPanel";
import type { BattleLogEntry } from "./battleLog";
import { AttackWarning, type AttackWarn } from "./AttackWarning";
import { cantAttackReason } from "./attackBlock";
import { useAttackAttempt } from "./useAttackAttempt";
import { RevealOverlay } from "./RevealOverlay";
import { CardSpotlightLayer } from "./CardSpotlight";
import { describeMatchResult } from "./matchResult";
import { CardTile } from "./CardTile";
import { canDragAttacker, canDragCounter, canDragHandCard, canDropPlayOnField, findDropTargetAtPoint, playCardTrashTargetIds, playNeedsReplace, isReplacePlay, resolveDropIntents, type DragPayload } from "./dragIntents";
import { AttackIndicator, DragAttackArrow } from "./AttackIndicator";
import { BoardMotion } from "./BoardMotion";
import { describeBattle } from "./battleBanner";
import { battleEndpoints } from "./battleArc";
import { useScreenWakeLock } from "./wakeLock";
import {
  CardActionPopover,
  DonAttachConfirm,
  DragGhost,
  type CardActionButton,
  type GhostPayload,
} from "./BoardOverlays";
import { blockIntentFor, cardActionText, counterIntentForCard, counterIntentForHand, soleCardButton, splitCardActions } from "./cardActions";
import { beginAttach, donIdsForTarget, quickAttachCounts } from "./donSelection";
import { handConfirmAnchor, handUseFromIntent, measureHandCard, type HandUse } from "./handPrompt";
import { isHandPick } from "./fieldTargets";
import { spectatorFans, spectatorHandGrid, usesPhoneFan, usesRailHand } from "./handLayout";
import { SpectatorFarHand } from "./SpectatorFarHand";
import { HandLabel } from "./HandLabel";
import { IntentBar } from "./IntentBar";
import { useSideDockPlacement } from "./sideDockPlacement";
import { PrimaryDock } from "./PrimaryDock";
import { waitingOnOpponent } from "./waitingOnOpponent";
import { DefendTray } from "./DefendTray";
import { useHudHeight } from "./useHudHeight";
import { clockFraction } from "./defendTrayModel";
import {
  attackTargetIdsForAttacker,
  findAttackIntent,
  filterIntentsForSelection,
  hasBoardActions,
} from "./intentFilter";
import { dockIntents, splitPrimaryIntent } from "./primaryIntent";
import { SideField } from "./SideField";
import { DonArtContext, donArtUrl } from "./donArt";
import { lookupCard } from "../cards/atlas";
import { cardBackCssValue, useCardBackUrl } from "../cardBack";
import { usePlaymatUrl } from "../playmat";
import { sideSkins } from "./seatSkins";
import { updateSettings, useDuelSettings } from "../settings";
import { PANEL_LABELS, collapsedColumns, type PanelColumn, type PanelId } from "./panelLayout";
import { SidePanel } from "./SidePanels";
import { fanDocked, farFanPosForDrop, parseFanPos, serializeFanPos, spectatorNearFanPosForDrop } from "./handFanPos";
import { fanCornerFor } from "./fanCorner";
import { type LoadMatchRecord } from "./MatchOverFacts";
import { useFanFit } from "./useFanFit";
import { useFanMove } from "./useFanMove";
import { endTurnWarning } from "./gameplayPrefs";
import { GameplaySettingsSheet } from "./GameplaySettings";
import { HotkeyHelpSheet } from "./HotkeyHelp";
import { actionKeyTags, stepHandSelection } from "./hotkeys";
import { useBoardHotkeys, useConfirmButtonKey } from "./useBoardHotkeys";
import { buzz } from "./haptics";
import { RotateHint } from "./RotateHint";
import { handCardOutOfReach, needsDonHint } from "./handAffordance";
import { firstSeatLine } from "./firstSeatLine";
import { playerLabel, seatLabel, seatName } from "./playerNames";
import { PendingBoard, type BoardWaiting } from "./PendingBoard";
import { fanPoseStyle, handDrawer } from "./handFanGeometry";
import { farHandWithReveals, revealedIdSet } from "./handReveal";
import { OppHandCorner, OppHandFan, OppHandHint, TurnStatusPanel } from "./TurnStatusPanel";
import { TurnSplash, type SplashMessage } from "./TurnSplash";
import { MatchMenu } from "./MatchMenu";
import type { ArtToggle } from "./HideArtItems";
import { LandscapeRail, LandscapeOverlay } from "./LandscapeRail";
import { useMatchBrief } from "./MatchBrief";
import { useLogPose } from "@optcg/analyst-client";
import { useLogPoseCopilot } from "./LogPoseCopilot";
import { LogPoseMatchButton } from "./LogPoseMatchButton";
import { matchLogPoseEntry } from "./matchBriefModel";
import type { BriefTicketWire } from "../net/protocol";
import { handIndexOf } from "./intentFields";
import { matchMenuItems } from "./matchMenuItems";
import { openFeedback } from "../feedbackDialog";
import { openReport } from "../reports/reportDialog";
import { matchReportTarget } from "../reports/reportTargets";
import { promptOpenFor } from "./promptHide";
import { promptShortLine } from "./promptLine";
import { BoardHud, HudUndoPass } from "./hud/BoardHud";
import { MatchResultView, type BoardRematch } from "./MatchResultView";
import { HandDockLayer } from "./HandDockLayer";
import { PendingChoicePrompt } from "./PendingChoicePrompt";
import { SpectatorFanLayer } from "./SpectatorFanLayer";
import { UndoRequestBanner } from "./UndoRequestBanner";
import { deriveUndoUi, type BoardUndo } from "./undoHud";
import { useBoardAudio } from "./useBoardAudio";
import { useBoardLayout } from "./useBoardLayout";
import { useBoardPanels } from "./useBoardPanels";
import { useDefendFlow } from "./useDefendFlow";
import { EMPTY_IDS, useDonSelection } from "./useDonSelection";
import { useFanState } from "./useFanState";
import { useFullscreen } from "./useFullscreen";
import { useHandArrangement } from "./useHandArrangement";
import { formatCountdown, seatClockLabels, useClockNow } from "./useMatchClocks";
import { useOppPlayPreview } from "./useOppPlayPreview";
import { useOrientationHint } from "./useOrientationHint";
import { usePromptState } from "./usePromptState";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  /** Seat-indexed display names (usernames) from the server welcome. */
  players?: SeatPlayers | null;
  timer?: TimerMessage | null;
  spectator?: boolean;
  battleLog?: BattleLogEntry[];
  /** Hotseat: compact pass-device control in the HUD (replaces the old top banner). */
  hotseatPass?: { otherSeat: Seat; onPass: () => void };
  /** The opponent is a person on another device (online play): automatic passes wait like a person would. */
  vsHuman?: boolean;
  /** Online play against another person: "Report player" is offered (not for bots, practice, hotseat or replays). */
  canReport?: boolean;
  /** Online match chat. Omit (e.g. practice) to hide the chat panel. */
  chat?: { lines: readonly ChatLine[]; onSend: (text: string) => void };
  /** Online players: concede sits next to Leave in the HUD. */
  onConcede?: () => void;
  /**
   * Online players: told the order of your hand (instance ids, left to right)
   * whenever it changes, so spectators' fans follow it. Omit for hotseat.
   */
  onHandOrder?: (ids: string[]) => void;
  /**
   * Turn undo (private rooms / practice). `autoAccept` = the other seat is
   * also this player (practice), so no request / answer UI is shown.
   */
  undo?: BoardUndo;
  /**
   * Online ranked / casual matches: loads the saved match (History's entry) so the
   * match-over card can show the rating change and link the match log.
   */
  loadMatchRecord?: LoadMatchRecord;
  /** Rematch vote on the match-over screen (unranked rooms). */
  rematch?: BoardRematch;
  /** Opponent dropped: epoch ms until which they may reconnect before forfeiting. */
  opponentAwayUntil?: number | null;
  /** Online: each seat's shared custom playmat / card back (shown for the opponent only). */
  seatSkins?: readonly [SeatSkin | null, SeatSkin | null];
  leaveLabel?: string;
  /**
   * Replay viewer: the board is a read-only spectator view of a recorded game. `controls` takes the action bar's
   * place, `quiet` mutes sounds and card spotlights while jumping around, and the room and concede links are gone.
   */
  replay?: { controls: ReactNode; quiet: boolean };
  /**
   * Log Pose matchup brief for casual and practice games: the game server's ticket and whether the room is
   * ranked. The board shows a Brief button and card only when the pair says unranked, a player and a ticket.
   */
  matchBrief?: {
    brief: BriefTicketWire | null;
    ranked: boolean | null;
    /** The seat the ticket is for (hotseat: seat 0, the player's). Online it is the board's own `seat`. The Log Pose copilot is offered on that seat's turns only. */
    ticketSeat?: Seat;
  };
  /** How the turn order was decided (the welcome's firstSeatPickedBy): null = coin flip, a seat = who chose; undefined = unknown. */
  firstSeatPickedBy?: Seat | null;
  /** Searches and effect ordering float cards over the board instead of a pop-up (always in matches; `/demo?box` shows the pop-up fallback). */
  floatingPrompts?: boolean;
  /** Before the first view: what the empty board says (queueing, connecting, starting). */
  waiting?: BoardWaiting;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

/** Your own Leader / Character / Stage by instance id (what the card popover anchors to). */
function findOwnCard(view: PlayerView, id: string): { id: string; defId: string } | null {
  if (view.you.leader.id === id) return view.you.leader;
  if (view.you.stage?.id === id) return view.you.stage;
  return view.you.characters.find((c) => c.id === id) ?? null;
}

export function DuelBoard({
  view,
  seat,
  matchId,
  errorBanner,
  matchOver,
  players = null,
  timer = null,
  spectator = false,
  battleLog = [],
  hotseatPass,
  vsHuman = false,
  canReport = false,
  chat,
  onConcede,
  onHandOrder,
  undo,
  opponentAwayUntil = null,
  seatSkins,
  rematch,
  loadMatchRecord,
  leaveLabel = "Leave",
  replay,
  matchBrief,
  firstSeatPickedBy,
  floatingPrompts = true,
  waiting,
  onSendIntent: sendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  /** Card last used from the hand and where it sat, for a Yes/No it asks next. */
  const [handUse, setHandUse] = useState<HandUse | null>(null);
  /** Set once useDefendFlow exists below; a hand-sent answer marks the defend step answered (#1140). */
  const noteAnsweredRef = useRef<((intent: Intent) => void) | null>(null);
  function onSendIntent(intent: Intent) {
    noteAnsweredRef.current?.(intent);
    // Blocking after all: a skip-block Counter must not follow onto the Blocker.
    if (intent.type === "declare_block") setQueuedCounter(null);
    if (view && handIndexOf(intent) !== undefined) {
      setHandUse(handUseFromIntent(intent, view.you.hand, measureHandCard));
    }
    sendIntent(intent);
  }
  /** Sending, or opening a prompt, drops the hand filter and the board selection. */
  const clearSelection = () => {
    setHandFilter(null);
    setSelectedBoardId(null);
  };
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  /** Wide layout: hand dock pinned open (click / tap on its handle). */
  const prefs = useDuelSettings();
  /** Seats whose custom art this viewer hid; lives and dies with the board, never saved (#812). */
  const [hiddenArtSeats, setHiddenArtSeats] = useState<ReadonlySet<Seat>>(() => new Set());
  const toggleHiddenArt = (seat: Seat) =>
    setHiddenArtSeats((prev) => {
      const next = new Set(prev);
      if (!next.delete(seat)) next.add(seat);
      return next;
    });
  const spectating = spectator || Boolean(view?.spectator);
  const isReplay = replay != null;
  const {
    pinned: handPinned,
    setPinned: setHandPinned,
    floatTucked,
    setFloatTucked,
    tuckUnderPointer,
    setTuckUnderPointer,
    hoverUp: fanHoverUp,
    setHoverUp: setFanHoverUp,
  } = useFanState(prefs.keepHandOpen);
  /**
   * Keep hand open: the player tucked the hand fully away (H or its Hide
   * button). For this visit only, not saved: a reload brings the hand back.
   */
  const [handHiddenRaw, setHandHidden] = useState(false);
  /** An effect asks me to pick cards from my hand: they are tapped in the hand, so it stays in view. */
  const handPick = !spectator && !view?.spectator && isHandPick(view?.pendingChoices?.[0], seat ?? view?.seat ?? null);
  const handHidden = handHiddenRaw && prefs.keepHandOpen && !handPick;
  const { wide, compactHud, portraitMat, simpleOwnBoard, lp, railHandTall, handLayout, tilted } = useBoardLayout(prefs, isReplay);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useHudHeight(rootRef, wide, view != null);
  const arenaBodyRef = useRef<HTMLDivElement | null>(null);
  const playmatRef = useRef<HTMLDivElement | null>(null);
  const { singleSide, logPoseSide, setLogPoseHostL, setLogPoseHostR, panelLayout, panelDrag, panelResize, lpPanel, setLpPanel } =
    useBoardPanels({ prefs, wide, lp, dragPayload, arenaBodyRef });
  const [promptSlot, setPromptSlot] = useState<HTMLElement | null>(null);
  const promptSlotValue = useMemo(() => ({ slot: promptSlot, setSlot: setPromptSlot }), [promptSlot]);
  /**
   * Spectators of unranked rooms see both hands face up: fanned on desktop,
   * compact grids on phones. Their Hand setting (saved, untouched) only
   * matters for hands they have to play.
   */
  const specFans = spectatorFans(Boolean((spectator || view?.spectator) && view?.revealedHands), wide, lp);
  /** Phones: both hands are grids of small upright cards, so the mats get the height the fans took. */
  const specGrid = spectatorHandGrid(specFans);
  /** Desktop: the hand fans off the bottom edge of the board (centre) or the rail (right). */
  const fanHand = wide && !lp && (specFans != null || handLayout !== "grid");
  /** Desktop fan: where the player dragged it (null = bottom centre of the board). */
  const fanPos = useMemo(() => parseFanPos(prefs.handFanPos), [prefs.handFanPos]);
  /** Desktop spectators: where each of the two fans was dragged (null = its default spot). */
  const specNearPos = useMemo(() => parseFanPos(prefs.spectatorNearFanPos), [prefs.spectatorNearFanPos]);
  const specFarPos = useMemo(() => parseFanPos(prefs.spectatorFarFanPos), [prefs.spectatorFarFanPos]);
  const fanRef = useRef<HTMLDivElement | null>(null);
  const farRef = useRef<HTMLDivElement | null>(null);
  const boardCentreX = () => {
    const r = playmatRef.current?.getBoundingClientRect();
    return r ? r.left + r.width / 2 : window.innerWidth / 2;
  };
  // The one near fan is the player's hand, or a spectator's near hand (a spot of its own).
  const fanMove = useFanMove(
    fanRef,
    specFans ? specNearPos : fanPos,
    (next) =>
      updateSettings(
        specFans ? { spectatorNearFanPos: serializeFanPos(next) } : { handFanPos: serializeFanPos(next) },
      ),
    boardCentreX,
    // A spectator's near fan goes home on the bottom edge, at any x; it is measured by its cards while docked.
    specFans ? (centreX, bottom, _h, vp) => spectatorNearFanPosForDrop(centreX, bottom, vp) : undefined,
    specFans ? { bodySelector: ".hand-fan-cards", anchorGrip: true } : undefined,
  );
  const farMove = useFanMove(
    farRef,
    specFarPos,
    (next) => updateSettings({ spectatorFarFanPos: serializeFanPos(next) }),
    boardCentreX,
    (centreX, bottom, height, vp) => {
      const mat = playmatRef.current?.getBoundingClientRect();
      return farFanPosForDrop(centreX, bottom, height, vp, mat?.top ?? 0);
    },
    { bodySelector: ".hand-fan-cards", anchorGrip: true },
  );
  const shownFanPos = fanMove.livePos ?? (specFans ? specNearPos : fanPos);
  /** The far fan is off its strip along the top of the board, floating where it was dragged. */
  const shownFarPos = specFans === "desktop" ? (farMove.livePos ?? specFarPos) : null;
  /** Off the bottom edge: fully shown unless tucked to its handle ("Let the hand tuck away"). */
  const fanFloating = fanHand && shownFanPos != null && (fanMove.livePos != null || !fanDocked(shownFanPos));
  /** Raised by the player (pin), as the hand button shows it. */
  const handUp = fanFloating ? !floatTucked : handPinned;
  // A spectator's far fan: the same states as the near one, of its own.
  const {
    pinned: farPinned,
    setPinned: setFarPinned,
    floatTucked: farFloatTucked,
    setFloatTucked: setFarFloatTucked,
    tuckUnderPointer: farTuckUnderPointer,
    setTuckUnderPointer: setFarTuckUnderPointer,
    hoverUp: farHoverUp,
    setHoverUp: setFarHoverUp,
  } = useFanState(false);
  const farUp = shownFarPos ? !farFloatTucked : farPinned;
  /** Default spot of the far fan: the board keeps a strip free along its top for the tucked cards. */
  const farTop = shownFarPos == null;
  /** Default spot: the board keeps a strip free under it for the tucked cards. */
  const fanCenter = fanHand && shownFanPos == null;
  // Landscape phones keep the hand in the right column (a scrolling grid), never over the field.
  const railHand = usesRailHand(wide, lp, railHandTall, fanHand);
  /** Portrait phones: the hand strip overlaps its cards in a fan instead of scrolling (spectators: a grid row). */
  const phoneFan = usesPhoneFan(wide, specGrid ? "grid" : specFans ? "fan" : handLayout);
  const {
    handSorted,
    setHandSorted,
    toggleHandSort,
    handDisplayIndices,
    handReorder,
    liftedHandId,
    setLiftedHandId,
  } = useHandArrangement({ prefs, view, spectating, fanFloating, onHandOrder });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { fullscreenOffered, isFullscreen, toggleFullscreen } = useFullscreen();
  const now = useClockNow(timer, opponentAwayUntil);
  const handRowRef = useRef<HTMLDivElement | null>(null);
  const playmatUrl = usePlaymatUrl();
  const cardBackUrl = useCardBackUrl();
  const playmatDim = prefs.playmatDim;
  const playmatOpacity = prefs.playmatOpacity;

  // Changing a setting mid-match applies it straight away.
  useEffect(() => {
    setHandPinned(prefs.keepHandOpen);
    setHandHidden(false);
  }, [prefs.keepHandOpen, setHandPinned]);

  // Trackpad / mouse wheel → horizontal hand scroll when the row overflows.
  useEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handCollapsed, wide, railHand, view?.you.hand.length]);

  const previewOppSeat = useOppPlayPreview({ battleLog, seat, view, wide, lp });

  const over = matchOver != null || view?.winner != null;
  // The strip shows the short question; the full server text stays in the tooltip.
  const midlineText = view
    ? view.pendingChoices?.length
      ? promptShortLine(view.pendingChoices[0])
      : view.battle
        ? describeBattle(view, (defId) => lookupCard(defId).name, !(spectator || view.spectator))
        : null
    : null;
  const midlineBattle = !!view?.battle && !view?.pendingChoices?.length;
  // On phones every pending prompt already shows its sentence (sheet, field bar or floating
  // card), so the midline would repeat it. It still blocks other hints from using the strip.
  const midlineShown = !wide && view?.pendingChoices?.length ? null : midlineText;
  const midlineTitle = view?.pendingChoices?.length ? view.pendingChoices[0].prompt : midlineShown;
  // Screen stays on through the opponent's long turns; released when the match ends.
  useScreenWakeLock(!over);
  /** "View board" on the match-over card: the card steps aside so the final board shows. */
  // A replay opens on the result pill rather than the modal, so the last move can be looked at.
  const [resultHidden, setResultHidden] = useState(isReplay);
  useEffect(() => {
    if (!over) setResultHidden(isReplay);
  }, [over, isReplay]);
  const mySeat = seat ?? view?.seat ?? null;
  /**
   * "Buttons beside the board" (#556, #564): on a computer the dock rides in a narrow gutter against the
   * right edge of the two mats, its primary button centred on the line where they meet, so the mats touch
   * and nothing is a strip between them. The gutter is reserved for the whole game (not tied to `over`), so
   * the board never moves or resizes when the buttons change. The tilted board leans the mats in
   * perspective, so it keeps the floating dock in the strip.
   */
  const sideActions = prefs.actionsBeside && wide && !lp && !spectating && !tilted;
  // The playmat only exists once the match view has arrived, so the placement effect re-runs then.
  useSideDockPlacement(playmatRef, sideActions && view != null);
  const brief = useMatchBrief({
    source: matchBrief,
    role: spectating ? "spectator" : "player",
    roomMatchId: matchId,
    phase: view?.phase,
    over,
    layout: lp ? "landscape" : wide ? "desktop" : "portrait",
  });
  const copilot = useLogPoseCopilot({
    source: matchBrief,
    role: spectating ? "spectator" : "player",
    view,
    battleLog,
    onSendIntent,
    over,
    layout: lp ? "landscape" : wide ? "desktop" : "portrait",
    ticketSeat: matchBrief?.ticketSeat ?? seat,
    errorBanner,
  });
  const logPoseEntry = matchLogPoseEntry({ briefShown: brief.shown, copilotShown: copilot.shown });
  const lpAnalyst = useLogPose();
  const logPoseOpen = logPoseEntry === "button" && lpAnalyst.panelOpen;
  // One Log Pose button for the brief and the copilot alike (#993).
  const logPoseButton =
    logPoseEntry === "button" ? <LogPoseMatchButton layout={lp ? "landscape" : wide ? "desktop" : "portrait"} over={over} busy={brief.busy || copilot.running} /> : null;
  const result = describeMatchResult({
    winner: matchOver?.winner ?? view?.winner,
    // The room's reason (concede / clock) beats the engine's view.winReason.
    reason: matchOver?.reason ?? view?.winReason,
    youSeat: spectating || isReplay ? null : mySeat,
    // Hotseat: one device plays both seats — name seats, not "You".
    neutral: Boolean(hotseatPass),
  });
  const mulliganPhase = view?.phase === "mulligan";
  const decidingMulligan =
    Boolean(view) && !spectating && mulliganPhase && !view!.you.mulliganDone && !over;
  const yourTurn =
    Boolean(view) &&
    !spectating &&
    !over &&
    (decidingMulligan || view!.activeSeat === mySeat);
  const intents = view?.legalIntents ?? [];
  const { hiddenChoiceId, setHiddenChoiceId, replaceCardId, setReplaceCardId, replaceHandIndex, replaceOpen, openReplace } =
    usePromptState({ view, intents, clearSelection });

  const {
    autoPass,
    defend,
    trayHere,
    railDefend,
    defendPrimary,
    counterLabel,
    setStagedCounterIds,
    setStagedBlockerId,
    setQueuedCounter,
    skipBlockToCounter,
    noteAnswered,
  } = useDefendFlow({
    view,
    intents,
    stopMode: prefs.responseStops,
    spectating,
    isReplay,
    over,
    vsHuman,
    wide,
    lp,
    onSendIntent,
  });
  noteAnsweredRef.current = noteAnswered;

  const { tabMute, tabMuteText, reveals, spotlights, replayQuiet } = useBoardAudio({
    view,
    battleLog,
    prefs,
    matchId,
    spectating,
    isReplay,
    hotseatPass,
    over,
    autoPass,
    intents,
    previewOppSeat,
    replay,
  });

  const { rotateHintShown, closeRotateHint } = useOrientationHint({
    orientationPref: prefs.screenOrientation,
    isFullscreen,
    boardReady: view != null,
    over,
    defendOpen: defend != null,
    midlineTaken: midlineText != null,
    hotseat: Boolean(hotseatPass),
  });

  // Small haptic tap when a drag lifts a card / DON!!.
  const dragging = dragPayload != null;
  useEffect(() => {
    if (dragging) buzz("pickup");
  }, [dragging]);

  const dndEnabled = yourTurn && !spectating && !over && !mulliganPhase;
  /**
   * Counter step: a Counter card can be dragged from hand onto the defender.
   * Block step too: the drop skips the block, then plays the Counter.
   */
  const counterDragEnabled = defend != null;
  const earlyCounterIds = useMemo(
    () => new Set(defend?.earlyCounters.map((c) => c.id) ?? []),
    [defend?.earlyCounters],
  );
  const counterDefenderId = useMemo(() => {
    if (!counterDragEnabled) return null;
    const ends = battleEndpoints(view);
    return ends?.incoming ? ends.targetId : null;
  }, [counterDragEnabled, view]);
  const {
    selectedDonIds,
    setSelectedDonIds,
    donPiles,
    setPendingAttach,
    pendingAttach,
    draggableDonIds,
    giveDonHighlightIds,
    donSelectActive,
    moveDonToPile,
    clearDonSelection,
    confirmAttach,
    toggleDonSelect,
    quickCounts,
    quickAttach,
  } = useDonSelection({
    view,
    intents,
    dndEnabled,
    dragPayload,
    selectedBoardId,
    replaceOpen,
    onSendIntent,
    clearSelection,
  });

  /** Keep hand open: tuck the whole hand away (only its handle stays), or bring it back. */
  function toggleHandHidden() {
    setHandHidden((v) => !v);
    setHandFilter(null);
  }

  /**
   * A mouse click leaves focus on the hand's card or button, and the next key
   * press (S, Space, …) makes it :focus-visible, which holds the hand up after
   * "Let the hand tuck away". Keyboard clicks (detail 0) keep their focus.
   */
  function dropHandClickFocus(e: ReactMouseEvent<HTMLElement>) {
    if (e.detail === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && e.currentTarget.contains(active)) active.blur();
  }

  /** The hand button and H: keep the hand up, or let it tuck away. */
  function toggleHandUp() {
    if (fanFloating) setFloatTucked(handUp);
    else setHandPinned(!handUp);
    if (handUp) {
      setFanHoverUp(false);
      setHandFilter(null);
      // Only with the pointer on the hand (H works from anywhere): away from
      // it, the next hover raises the hand again.
      setTuckUnderPointer(document.querySelector(".hand-fan:hover, .hand-dock:hover") != null);
    }
  }

  /** The far fan's hand button: keep it up, or let it tuck away (it stays down until the pointer leaves). */
  function toggleFarUp() {
    if (shownFarPos) setFarFloatTucked(farUp);
    else setFarPinned(!farUp);
    if (farUp) {
      setFarHoverUp(false);
      setFarTuckUnderPointer(farRef.current?.matches(":hover") ?? false);
    }
  }

  /** Portrait phones: fold the hand away under its title row, or open it again. */
  function toggleHandCollapsed() {
    setHandCollapsed((v) => !v);
    setHandFilter(null);
  }

  /** Under the handle: Hide / Show, only with Keep hand open (H does the same). */
  const hideHandBtn = prefs.keepHandOpen ? (
    <button
      type="button"
      className={`hand-rail-btn hand-hide-btn${handHidden ? " active" : ""}`}
      aria-pressed={handHidden}
      title={handHidden ? "Show your hand (H)" : "Hide your hand (H)"}
      onClick={toggleHandHidden}
    >
      {handHidden ? "Show" : "Hide"}
    </button>
  ) : null;

  /** Sort by cost on / off; the S tag (desktop key tags) is the same toggle's key. */
  const sortHandBtn = (
    <button
      type="button"
      className={`hand-rail-btn hand-sort-btn${handSorted ? " active" : ""}`}
      aria-pressed={handSorted}
      title="Sort the hand by cost (S)"
      data-key-tag={prefs.shortcutTags ? "S" : undefined}
      onClick={toggleHandSort}
    >
      Sort
    </button>
  );

  useConfirmButtonKey();
  useBoardHotkeys({
    spectating,
    over,
    // H only toggles the fan / corner dock; the rail hand is always open.
    wide: wide && !railHand,
    cardKeys: wide && !lp,
    handHides: prefs.keepHandOpen,
    onEscape: () => {
      // One layer per press: DON!! selection first, then the selected card.
      if (selectedDonIds.size > 0 || pendingAttach != null) clearDonSelection();
      else {
        setHandFilter(null);
        setSelectedBoardId(null);
      }
    },
    onStepHand: (dir) => {
      const order = handDisplayIndices ?? (view?.you.hand ?? []).map((_, i) => i);
      const next = stepHandSelection(order, handFilter, dir);
      if (next == null) return;
      setSelectedBoardId(null);
      setHandFilter(next);
      // Picking a hand card from the keyboard brings a hidden hand back.
      setHandHidden(false);
    },
    onToggleHand: toggleHandUp,
    onHideHand: toggleHandHidden,
    onSortHand: () => setHandSorted((v) => !v),
    onHelp: () => setHelpOpen(true),
    fullscreenOffered,
    onToggleFullscreen: toggleFullscreen,
    onToggleTabMute: tabMute.toggle,
  });

  const playFieldHighlight = Boolean(
    dragPayload?.type === "play_card" &&
      (canDropPlayOnField(intents, dragPayload.handIndex) ||
        playNeedsReplace(intents, dragPayload.handIndex)),
  );

  const playTrashHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "play_card") return EMPTY_IDS;
    return new Set(playCardTrashTargetIds(intents, dragPayload.handIndex));
  }, [dragPayload, intents]);

  const actionableBoardIds = useMemo(() => {
    if (!view) return EMPTY_IDS;
    const ids = new Set<string>();
    const candidates = [
      view.you.leader.id,
      ...view.you.characters.map((c) => c.id),
      ...(view.you.stage ? [view.you.stage.id] : []),
    ];
    for (const id of candidates) {
      if (hasBoardActions(intents, id)) ids.add(id);
    }
    return ids;
  }, [view, intents]);

  // Over the hand, a dragged hand card is being reordered: the hand stays up
  // instead of tucking away for a drop on the board.
  const reorderInHand = handReorder.reorder?.inZone === true;
  const handTucked = dragPayload != null && !reorderInHand;

  // Attack drag: your Leader / Characters with a legal declare_attack.
  const draggableAttackerIds = useMemo(() => {
    if (!dndEnabled || !view) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const id of [view.you.leader.id, ...view.you.characters.map((c) => c.id)]) {
      if (canDragAttacker(intents, id)) ids.add(id);
    }
    return ids;
  }, [dndEnabled, view, intents]);

  // Attack-ready glow (#412): your Leader / Characters with a legal declare_attack.
  const attackReadyIds = prefs.attackGlow ? draggableAttackerIds : EMPTY_IDS;

  // Targets for the attacker being dragged, else for the tapped attacker.
  const attackerId = dragPayload?.type === "attack" ? dragPayload.attackerId : selectedBoardId;
  const attackTargetIds = useMemo(() => {
    if (!dndEnabled || !attackerId || !view) return EMPTY_IDS;
    return new Set(attackTargetIdsForAttacker(intents, attackerId, view.opponent.leader.id));
  }, [dndEnabled, attackerId, intents, view]);

  function commitDrop(payload: DragPayload, clientX: number, clientY: number) {
    const drop = findDropTargetAtPoint(clientX, clientY);
    // Sequential client-side intents (no batch protocol) — one give_don per
    // selected donId that has a legal intent to this target.
    const toSend = resolveDropIntents(payload, drop, intents, {
      opponentLeaderId: view?.opponent.leader.id,
      defenderId: counterDefenderId,
    });
    setDragPayload(null);
    if (
      toSend.length === 0 &&
      payload.type === "play_card" &&
      drop?.kind !== "play_trash" &&
      playNeedsReplace(intents, payload.handIndex)
    ) {
      // Dropped on a full board without picking a Character: ask which one.
      openReplace(payload.handIndex);
      return;
    }
    if (toSend.length > 0) {
      buzz("drop");
      setHandFilter(null);
      setSelectedBoardId(null);
      if (payload.type === "counter") {
        // A dropped card is played now, so it is no longer staged in the tray.
        const cardId = view?.you.hand[payload.handIndex]?.id;
        setStagedCounterIds((cur) => cur.filter((id) => id !== cardId));
        // Block step: only the pass goes now; the Counter follows it.
        if (cardId && toSend[0]?.type === "pass_block") {
          setStagedBlockerId(null);
          setQueuedCounter({ cardId, mode: "send" });
        }
      }
      for (const intent of toSend) onSendIntent(intent);
      if (payload.type === "give_don") clearDonSelection();
    }
  }

  /** The card-action pop-up's buttons for a selection, as the render below computes them (pending choices own their answers). */
  function popoverIntentsFor(selection: { handIndex: number | null; boardId: string | null }, dropGiveDonTo?: string): Intent[] {
    if (!view || spectating || defendPrimary) return [];
    const front = view.pendingChoices?.[0];
    const base = front
      ? view.legalIntents.filter((i) => i.type !== "resolve_pending_choice" && i.type !== "order_pending_effects")
      : dropGiveDonTo
        ? view.legalIntents.filter((i) => !(i.type === "give_don" && i.targetId === dropGiveDonTo))
        : view.legalIntents;
    return splitCardActions(filterIntentsForSelection(splitPrimaryIntent(base).rest, selection)).card;
  }

  function pressCardAction(intent: Intent) {
    if (isReplacePlay(intent)) {
      openReplace(intent.handIndex);
      return;
    }
    setHandFilter(null);
    setSelectedBoardId(null);
    onSendIntent(intent);
  }

  function selectHandCard(idx: number) {
    if (prefs.oneTapActions && !trayHere && defend?.phase === "counter") {
      const counter = counterIntentForHand(intents, idx);
      if (counter) {
        setHandFilter(null);
        setSelectedBoardId(null);
        onSendIntent(counter);
        return;
      }
    }
    // One-tap: a pop-up with a single button does it straight away (hand pop-ups have no DON!! row).
    if (prefs.oneTapActions && handFilter !== idx && !dragPayload && !replaceOpen && !donSelectActive) {
      const sole = soleCardButton(popoverIntentsFor({ handIndex: idx, boardId: null }), []);
      if (sole?.kind === "action") {
        pressCardAction(sole.action);
        return;
      }
    }
    setSelectedBoardId(null);
    setHandFilter((prev) => (prev === idx ? null : idx));
  }

  function selectBoardCard(id: string) {
    if (selectedDonIds.size > 0) {
      // DON!! selected → tapping a legal Leader/Character asks to attach.
      const pending = beginAttach(intents, selectedDonIds, id);
      if (pending) {
        // One-tap: the tap itself is the confirmation.
        if (prefs.oneTapActions) confirmAttach(pending);
        else setPendingAttach(pending);
        return;
      }
      clearDonSelection();
    }
    if (prefs.oneTapActions && !trayHere && defend?.phase === "block") {
      const block = blockIntentFor(intents, id);
      if (block) {
        setHandFilter(null);
        setSelectedBoardId(null);
        onSendIntent(block);
        return;
      }
    }
    // One-tap: a pop-up with a single action does it straight away. A tap never gives DON!!, so a card whose
    // pop-up is only the +1 / +2 row (like one you just played) still opens it.
    if (prefs.oneTapActions && view && selectedBoardId !== id && !dragPayload && !replaceOpen && !donSelectActive) {
      const quickRow =
        dndEnabled && (view.you.leader.id === id || view.you.characters.some((c) => c.id === id))
          ? quickAttachCounts(donIdsForTarget(intents, id).length)
          : [];
      const sole = soleCardButton(
        popoverIntentsFor({ handIndex: null, boardId: id }, quickRow.length > 0 ? id : undefined),
        quickRow,
      );
      if (sole) {
        pressCardAction(sole.action);
        return;
      }
    }
    setHandFilter(null);
    setSelectedBoardId((prev) => (prev === id ? null : id));
  }

  // Drop a stale selection when the selected card leaves your board (KO'd, trashed, etc.)
  // or the turn changes, so the intent bar never lingers on a dead selection.
  useEffect(() => {
    if (!selectedBoardId || !view) return;
    const stillOnBoard =
      view.you.leader.id === selectedBoardId ||
      view.you.characters.some((c) => c.id === selectedBoardId) ||
      view.you.stage?.id === selectedBoardId;
    if (!stillOnBoard) setSelectedBoardId(null);
  }, [selectedBoardId, view]);

  // "Can't attack" feedback: dragging a card that has no legal attack, or
  // tapping an opposing card with such a card selected (a plain tap only selects).
  const [attackWarn, setAttackWarn] = useState<AttackWarn | null>(null);
  useAttackAttempt({
    enabled: dndEnabled,
    selectedId: selectedBoardId,
    reasonFor: (id) => {
      if (!view) return null;
      const card =
        view.you.leader.id === id ? view.you.leader : view.you.characters.find((c) => c.id === id);
      if (!card) return null;
      return cantAttackReason(card, {
        phase: view.phase,
        busy: Boolean(view.battle) || Boolean(view.pendingChoices?.length),
        turnsStarted: view.you.turnsStarted,
        intents,
      });
    },
    onAttempt: (a) => setAttackWarn({ ...a, nonce: Date.now() }),
  });

  function selectAttackTarget(targetId: string) {
    if (!view || !selectedBoardId) return;
    const intent = findAttackIntent(intents, selectedBoardId, targetId, view.opponent.leader.id);
    if (intent) {
      setSelectedBoardId(null);
      onSendIntent(intent);
    }
  }

  useFanFit(
    fanRef,
    view ? (spectating ? (view.you.handCount ?? 0) : view.you.hand.length) : 0,
    fanHand && view != null,
    shownFanPos == null ? "centre" : fanMove.livePos || !fanDocked(shownFanPos) ? "float" : "docked",
  );
  // The far fan (spectators) is fitted to the opponent's mat the same way.
  const farHandCount = specFans === "desktop" && view ? (view.revealedHands?.[(mySeat ?? view.seat) === 0 ? 1 : 0]?.length ?? 0) : 0;
  useFanFit(
    farRef,
    farHandCount,
    farHandCount > 0,
    shownFarPos == null ? "top" : "float",
    ".arena .side-opp",
  );

  if (!view) {
    return (
      <PendingBoard
        waiting={
          waiting ?? {
            status: "Waiting for opponent…",
            // Seat 0 created the room: copy its id straight away.
            invite: { roomId: matchId, autoCopy: seat === 0 && !spectating },
          }
        }
        errorBanner={errorBanner}
        leaveLabel={leaveLabel}
        onLeave={onLeave}
        onClearError={onClearError}
      />
    );
  }

  const you = view.you;
  const opp = view.opponent;
  // A Yes/No from the card just used from the hand sits on that card, not in a pop-up.
  const handConfirm = spectating
    ? null
    : handConfirmAnchor(view.pendingChoices?.[0], mySeat, handUse, you);
  // Wide boards: mid-battle, the centred prompt keeps off the card being hit.
  const promptBattle = (() => {
    const ends = wide && !lp ? battleEndpoints(view) : null;
    return ends ? { defenderId: ends.targetId, attackerId: ends.attackerId } : null;
  })();

  const ghostPayload: GhostPayload | null =
    reorderInHand || liftedHandId != null
    ? // A hand card is carried by its own lifted copy (useHandLift).
      null
    : dragPayload?.type === "give_don"
      ? { type: "give_don", count: dragPayload.donIds.length }
      : (dragPayload?.type === "play_card" || dragPayload?.type === "counter") &&
          you.hand[dragPayload.handIndex]
        ? {
            type: dragPayload.type,
            defId: you.hand[dragPayload.handIndex]!.defId,
            ownerSeat: mySeat ?? view.seat,
          }
        : // An attack drag shows the aim arrow instead of a carried card.
          null;

  const pendingAttachName = (() => {
    if (!pendingAttach) return "";
    const card =
      you.leader.id === pendingAttach.targetId
        ? you.leader
        : you.characters.find((c) => c.id === pendingAttach.targetId);
    return card ? lookupCard(card.defId).name : "target";
  })();
  const boardSeat: Seat = mySeat ?? view.seat;
  const oppSeat: Seat = boardSeat === 0 ? 1 : 0;
  // Unranked rooms send spectators both hands face up.
  const nearHand = spectating ? view.revealedHands?.[boardSeat] : undefined;
  const farHand = spectating ? view.revealedHands?.[oppSeat] : undefined;
  /** Desktop: the opponent hand pinned above the playmat instead of its side panel. */
  const oppHandOnMat = wide && !lp && !farHand && prefs.oppHandSpot ? prefs.oppHandSpot : null;
  /** Phones: "Opponent hand, top right" moves its row to the right of the opponent's half. */
  const oppHandRight = prefs.oppHandSpot === "right" && !farHand;
  // Match over (#482): the hand flips face up in place. Layout keeps keying off `farHand`
  // (spectators only) so nothing moves at game over.
  const myRevealed = revealedIdSet(spectating ? undefined : view.handReveals?.[boardSeat]);
  // While live, cards an effect revealed from their hand stay face up among the backs (#491).
  // A replay is played from both seats (#966): the hand across the table is face up, unless the view leaves it out ("What I saw").
  const shownFarHand =
    farHand ?? (over || isReplay ? view.revealedHands?.[oppSeat] : farHandWithReveals(opp.handCount, view.handReveals?.[oppSeat]));
  const revealLife = over ? view.revealedLife : undefined;
  const lifeFaceUp = (seat: Seat, fallback: typeof opp.faceUpLife) =>
    revealLife ? revealLife[seat].map((defId, index) => ({ index, defId })) : fallback;
  const viewingSeat: Seat | undefined = spectating ? undefined : boardSeat;
  // Older servers omit firstSeat; they always started seat 0.
  const firstSeat: Seat = view.firstSeat ?? 0;
  const youFirst = boardSeat === firstSeat;
  const orderLabel = spectating || isReplay
    ? `${playerLabel(firstSeat)} goes first`
    : youFirst
      ? "You go first"
      : "You go second";
  const oppActive = !mulliganPhase && !over && view.activeSeat === oppSeat;
  const youActive = !mulliganPhase && !over && view.activeSeat === boardSeat;
  const turnClock = formatCountdown(timer?.turnEndsAt, now);
  const matchClock = formatCountdown(timer?.matchEndsAt, now);
  const seatClocks = seatClockLabels(timer ?? null, now, boardSeat, oppSeat);
  const awayLeft = opponentAwayUntil != null && !over ? formatCountdown(opponentAwayUntil, now) : null;
  const handCount = spectating ? (you.handCount ?? 0) : you.hand.length;
  // Hearthstone-style dock: peeks until hovered; stays open while you pick
  // your opening hand or have a hand card selected.
  const drawer = handDrawer({
    pinned: handUp,
    hidden: handHidden && specFans == null,
    mulligan: decidingMulligan,
    selected: handFilter != null,
    picking: handPick,
  });
  const handOpen = drawer === "open";
  const drawerClass =
    drawer === "open" ? " is-open" : drawer === "hidden" ? " is-hidden" : tuckUnderPointer ? " is-tucking" : "";

  const splash: SplashMessage | null = over || !prefs.turnSplash || replayQuiet
    ? null
    : mulliganPhase
      ? spectating
        ? null
        : {
            key: `order-${matchId ?? ""}-${boardSeat}`,
            title: youFirst ? "You go first" : "You go second",
            sub: youFirst ? "No draw · 1 DON!! on turn 1" : "You draw · 2 DON!! on turn 1",
            tone: youFirst ? "mine" : "theirs",
            ms: 3200,
          }
      : {
          key: `turn-${view.turnNumber}-${view.activeSeat}`,
          title: spectating
            ? `${seatLabel(players, view.activeSeat)}'s turn`
            : youActive
              ? "Your turn"
              : "Opponent's turn",
          sub:
            view.turnNumber <= 2 && !spectating
              ? `Turn ${view.turnNumber} · you went ${youFirst ? "first" : "second"}`
              : `Turn ${view.turnNumber}`,
          tone: spectating ? "neutral" : youActive ? "mine" : "theirs",
        };

  const undoUi = deriveUndoUi(undo, boardSeat);
  const { undoState, undoPendingTheirs, undoNothingYet } = undoUi;

  /** Card showing where a hand card dragged over the hand would land, if it moves. */
  function reorderMarker(ids: readonly string[]): { id: string; cls: string } | null {
    const r = handReorder.reorder;
    if (handSorted || !r || r.slot == null) return null;
    const others = ids.filter((id) => id !== r.cardId);
    if (others.length === 0 || ids.indexOf(r.cardId) === r.slot) return null;
    return r.slot < others.length
      ? { id: others[r.slot]!, cls: "hand-drop-before" }
      : { id: others[others.length - 1]!, cls: "hand-drop-after" };
  }

  /** A spectator's desktop fan grip (the same handle as the player's fan), when Drag handles are on. */
  function specGrip(which: "near" | "far") {
    if (specFans !== "desktop" || !prefs.layoutGrips) return undefined;
    const move = which === "near" ? fanMove : farMove;
    const name = seatLabel(players, which === "near" ? boardSeat : oppSeat);
    return (
      <button
        type="button"
        className="hand-fan-grip"
        aria-label={`Move ${name} hand (drag, or arrow keys)`}
        title={`Drag to move ${name} hand anywhere`}
        {...move.gripProps}
      >
        <span aria-hidden />
      </button>
    );
  }

  /** A spectator's hand button: the match's Hand pill, titled with the seat's name; raises or tucks that fan. */
  function specHandToggle(which: "near" | "far", count: number) {
    const near = which === "near";
    const up = near ? handUp : farUp;
    return (
      <button
        type="button"
        className="hand-fan-toggle"
        aria-expanded={near ? handOpen : farUp}
        title={up ? "Let the hand tuck away" : "Keep the hand up"}
        onClick={near ? toggleHandUp : toggleFarUp}
      >
        <span className="hand-fan-title">{seatLabel(players, near ? boardSeat : oppSeat)} hand</span>
        <span className="hand-rail-count">{count}</span>
        <span className="hand-dock-caret" aria-hidden>
          {up ? "▾" : "▴"}
        </span>
      </button>
    );
  }

  /** `fanned`: each card gets its tilt and arc drop (see handFan.ts). */
  function renderHandCards(fanned = false) {
    const pose = (i: number, n: number): CSSProperties | undefined => (fanned ? fanPoseStyle(i, n) : undefined);
    if (spectating && nearHand) {
      return nearHand.map((c, i) => (
        <CardTile
          key={c.id}
          motionId={c.id}
          defId={c.defId}
          showCounter={prefs.handCounters}
          inspectOnClick
          ownerSeat={boardSeat}
          style={pose(i, nearHand.length)}
        />
      ));
    }
    if (spectating) {
      const n = Math.min(you.handCount ?? 0, 8);
      const back = skins.near.cardBack
        ? ({ "--card-back-art": cardBackCssValue(skins.near.cardBack) } as CSSProperties)
        : undefined;
      return Array.from({ length: n }).map((_, i) => (
        <span key={i} className="card-back hand-back" style={{ ...back, ...pose(i, n) }} />
      ));
    }
    const order = handDisplayIndices ?? you.hand.map((_, i) => i);
    // Unsorted, any hand card can be dragged to a new spot in the hand.
    const reorderable = !handSorted;
    const marker = reorderMarker(order.map((i) => you.hand[i]!.id));
    return order.map((idx, pos) => {
      const c = you.hand[idx]!;
      const playable = dndEnabled && canDragHandCard(intents, idx);
      const counterable =
        !playable &&
        counterDragEnabled &&
        (defend?.phase === "block" ? earlyCounterIds.has(c.id) : canDragCounter(intents, idx));
      const boardDrag = playable || counterable;
      const cost = c.playCost ?? lookupCard(c.defId).cost;
      // Main phase, no legal play for it, and not enough active DON!!: show it as out of reach.
      const unaffordable = handCardOutOfReach({
        dimSetting: prefs.dimUnplayable,
        mainPhase: yourTurn && view?.phase === "main",
        picking: !!handPick,
        playable,
        cost,
        activeDon: you.activeDonCount,
        blocked: c.blocked,
      });
      const payload: DragPayload = counterable
        ? { type: "counter", handIndex: idx }
        : { type: "play_card", handIndex: idx };
      return (
        <CardTile
          key={c.id}
          motionId={c.id}
          defId={c.defId}
          playCost={c.playCost}
          blocked={yourTurn && view?.phase === "main" ? c.blocked : undefined}
          showCounter={prefs.handCounters}
          selected={handFilter === idx}
          onClick={() => selectHandCard(idx)}
          instantClick={!prefs.oneTapActions}
          dragEnabled={boardDrag || reorderable}
          dragPayload={payload}
          onDragStart={() => {
            setLiftedHandId(c.id);
            handReorder.begin(c.id);
            if (boardDrag) setDragPayload(payload);
          }}
          onDragEnd={(x, y) => {
            setLiftedHandId(null);
            // Dropped back on the hand: a new spot in the hand (or no move when sorted), never a play.
            if (handReorder.end(x, y, reorderable)) setDragPayload(null);
            else if (boardDrag) commitDrop(payload, x, y);
          }}
          onDragCancel={() => {
            setLiftedHandId(null);
            handReorder.cancel();
            setDragPayload(null);
          }}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
          revealed={myRevealed.has(c.id)}
          classNameExtra={[unaffordable ? "hand-unaffordable" : "", myRevealed.has(c.id) ? "hand-revealed" : "", marker?.id === c.id ? marker.cls : "", liftedHandId === c.id ? "card-lifted" : ""].filter(Boolean).join(" ") || undefined}
          style={pose(pos, order.length)}
        />
      );
    });
  }

  const defendTray =
    (trayHere || railDefend) && defend ? (
      <DefendTray
        model={defend}
        layout={railDefend ? "rail" : "tray"}
        handCount={trayHere ? handCount : undefined}
        ownerSeat={boardSeat}
        clock={clockFraction(timer, now, boardSeat)}
        onToggleBlocker={(id) => {
          const block = prefs.oneTapActions || railDefend ? blockIntentFor(intents, id) : null;
          if (block) {
            setStagedBlockerId(null);
            onSendIntent(block);
          } else setStagedBlockerId((cur) => (cur === id ? null : id));
        }}
        onToggleCounter={(id) => {
          const counter =
            prefs.oneTapActions || railDefend ? counterIntentForCard(intents, you.hand, id) : null;
          if (counter) onSendIntent(counter);
          else
            setStagedCounterIds((cur) =>
              cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
            );
        }}
        onCounterEvent={(i) => {
          const intent = defend.events[i]?.intent;
          if (intent) onSendIntent(intent);
        }}
        // The rail has no Confirm step (the dock only passes), so it plays the Counter.
        onSkipBlockCounter={(id) => skipBlockToCounter(id, prefs.oneTapActions || railDefend ? "send" : "stage")}
        counterDrag={
          defend.phase === "counter" || defend.earlyCounters.length > 0
            ? {
                onStart: (cardId) => {
                  const handIndex = you.hand.findIndex((c) => c.id === cardId);
                  if (handIndex >= 0) setDragPayload({ type: "counter", handIndex });
                },
                onEnd: (cardId, x, y) => {
                  const handIndex = you.hand.findIndex((c) => c.id === cardId);
                  if (handIndex >= 0) commitDrop({ type: "counter", handIndex }, x, y);
                  else setDragPayload(null);
                },
                onCancel: () => setDragPayload(null),
              }
            : undefined
        }
      />
    ) : null;

  const barIntents = (() => {
    const front = view.pendingChoices?.[0];
    // ChoicePrompt / EffectOrderPrompt own every pending-choice answer.
    if (front) {
      return view.legalIntents.filter(
        (i) => i.type !== "resolve_pending_choice" && i.type !== "order_pending_effects",
      );
    }
    // The quick row replaces the row of identical "Give DON" buttons.
    return quickCounts.length > 0
      ? view.legalIntents.filter((i) => !(i.type === "give_don" && i.targetId === selectedBoardId))
      : view.legalIntents;
  })();
  // The selected card's own actions live on the card (a popover), not in the bar.
  const cardIntents =
    spectating || defendPrimary
      ? []
      : splitCardActions(
          filterIntentsForSelection(splitPrimaryIntent(barIntents).rest, {
            handIndex: handFilter,
            boardId: selectedBoardId,
          }),
        ).card;
  const anchorCard =
    handFilter != null ? you.hand[handFilter] : selectedBoardId ? findOwnCard(view, selectedBoardId) : null;
  const popoverOpen =
    anchorCard != null &&
    !dragPayload &&
    !replaceOpen &&
    !donSelectActive &&
    (cardIntents.length > 0 || quickCounts.length > 0);
  const cardTags = actionKeyTags(cardIntents);
  const popoverActions: CardActionButton[] = cardIntents.map((intent, i) => ({
    id: `${intent.type}-${i}`,
    text: cardActionText(intent, view),
    keyNum: cardTags[i]!.num,
    keyLetter: cardTags[i]!.letter,
    keyTag: prefs.shortcutTags ? cardTags[i]!.tag : "",
    onPress: () => pressCardAction(intent),
  }));

  // Desktop: the primary action (and any other phase-wide one: Keep / Mulligan,
  // Resolve trigger) floats at the board's midline; there is no Actions panel.
  // Phones keep the bottom IntentBar.
  const oppWait =
    spectating || over || hotseatPass ? null : waitingOnOpponent(view, mySeat);
  const sendPrimary = (intent: Intent) => {
    setHandFilter(null);
    setSelectedBoardId(null);
    onSendIntent(intent);
  };
  const dock = dockIntents(barIntents, { defending: defendPrimary != null });
  const selectedHandCard = handFilter != null ? you.hand[handFilter] : undefined;
  const affordHint =
    selectedHandCard && yourTurn && view.phase === "main" && cardIntents.length === 0
      ? needsDonHint(selectedHandCard.playCost ?? lookupCard(selectedHandCard.defId).cost, you.activeDonCount, selectedHandCard.blocked) ?? undefined
      : undefined;
  // The replay controls ride where the action bar does (phones); on desktop they dock in the right rail.
  const replayBar = replay ? (
    <div className="intent-bar replay-bar">
      {/* The result lives in the controls' own slim row here, so it never covers the board. */}
      {isValidElement(replay.controls)
        ? cloneElement(replay.controls as React.ReactElement<{ resultSlot?: ReactNode }>, {
            resultSlot:
              over && resultHidden ? (
                <>
                  <span className={`match-result-inline-text match-result-${result.outcome}`}>{result.headline}</span>
                  <button type="button" className="replay-result-btn" onClick={() => setResultHidden(false)}>
                    Show result
                  </button>
                </>
              ) : null,
          })
        : replay.controls}
    </div>
  ) : null;
  // Desktop has no Actions panel: only the defend tray stays in the rail.
  const intentPanel = railDefend && defendTray ? (
    defendTray
  ) : wide && !lp ? null : !spectating ? (
    <>
    <IntentBar
      waiting={oppWait}
      idle={oppWait ? "opponent" : view.pendingChoices?.[0]?.seat === mySeat ? "prompt" : null}
      intents={barIntents}
      view={view}
      disabled={over}
      filterHandIndex={handFilter}
      selectedBoardId={selectedBoardId}
      confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
      onSend={sendPrimary}
      onChooseReplace={openReplace}
      defend={defendPrimary}
      counterLabel={counterLabel}
      onCard={{ count: cardIntents.length, active: popoverOpen }}
      emptyHint={affordHint}
    />
    {replayBar}
    </>
  ) : replayBar ? (
    replayBar
  ) : !wide || lp ? null : (
    // Phones: the HUD's SPECTATOR chip says it already, and the bar's height goes to the mats.
    <div className="intent-bar">
      <p className="intent-empty">
        {nearHand ? "Spectating — both hands shown; intents disabled" : "Spectating — both hands hidden; intents disabled"}
      </p>
    </div>
  );

  const chatPanel = chat && prefs.showChat ? (
    <ChatPanel
      lines={chat.lines}
      mySeat={spectating ? null : boardSeat}
      onSend={chat.onSend}
      onConcede={onConcede && !spectating && !over ? onConcede : undefined}
      defaultOpen={wide}
    />
  ) : null;
  const skins = sideSkins({
    own: { playmat: playmatUrl, cardBack: cardBackUrl, donArt: prefs.donArt },
    seatSkins,
    nearSeat: boardSeat,
    farSeat: oppSeat,
    hotseat: Boolean(hotseatPass),
    spectating,
    showOthersArt: prefs.showOthersArt,
    hiddenSeats: hiddenArtSeats,
  });
  // One row per other seat that has custom art to hide (both seats when spectating); none in practice.
  const artToggles: ArtToggle[] = hotseatPass || !prefs.showOthersArt
    ? []
    : (spectating ? [boardSeat, oppSeat] : [oppSeat])
        .filter((s) => seatSkins?.[s]?.playmat || seatSkins?.[s]?.cardBack)
        .map((s) => ({ seat: s, name: spectating ? seatLabel(players, s) : seatName(players, s), hidden: hiddenArtSeats.has(s) }));
  const oppMatUrl = skins.far.playmat;
  const oppCardBackUrl = skins.far.cardBack;
  const nearDonUrl = donArtUrl(skins.near.donArt);
  const farDonUrl = donArtUrl(skins.far.donArt);
  /** DON!! face for a seat's half; no seat (or your own) is the near half. */
  const donArtForSeat = (s?: Seat) => (s != null && s === oppSeat && s !== boardSeat ? farDonUrl : nearDonUrl);

  /** Desktop: the card preview floats as a draggable pop-up instead of sitting in a side column (#529). */
  const previewPopup = prefs.previewPopup && prefs.showCardPreview && wide && !lp;
  /** Desktop side panels, by id; null when a panel has nothing to show right now. */
  const sidePanels: Record<PanelId, React.ReactNode> = {
    // Hidden panels are null: they keep their place in panelLayout and come back in it.
    preview: prefs.showCardPreview && !previewPopup ? <CardPreviewPanel /> : null,
    recent: prefs.showRecentPlays ? (
      <RecentPlaysStrip entries={battleLog} youSeat={previewOppSeat === 0 ? 1 : 0} />
    ) : null,
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
    // The host the docked Log Pose panel renders into; the panel wrapper gives it the grip and dividers.
    logpose: logPoseSide ? (
      <div ref={logPoseSide === "left" ? setLogPoseHostL : setLogPoseHostR} className="lp-dock-host" data-panel-host="logpose" />
    ) : null,
  };
  /** Panels with something to show, top to bottom, in each column (the rest keep their places). */
  const shownPanels: Record<PanelColumn, PanelId[]> = {
    left: panelLayout.left.filter((id) => sidePanels[id] != null),
    right: panelLayout.right.filter((id) => sidePanels[id] != null),
  };
  /** Bigger playing area: columns take their minimum width, so a dragged width is set aside (not lost). */
  const bigBoard = prefs.bigBoard || (spectating && lp);
  /**
   * A desktop column with nothing in it (every panel hidden or moved away)
   * collapses so the board gets its width; while a panel is being dragged both
   * stay open as drop targets.
   */
  /** The column the defend tray rides in. */
  const defendCol: PanelColumn = singleSide ?? "right";
  const collapsed = collapsedColumns(shownPanels, panelDrag.draggingId != null && !singleSide, {
    [defendCol]: railDefend && defendTray != null,
  });
  /**
   * Bigger playing area on a computer: no top bar. Its buttons ride in a row at the top of the right column, or
   * of the left one when the right has nothing in it. The side follows what is on screen when nothing is being
   * dragged, so the row stays put while a panel is carried over the columns; with both columns empty the right
   * one stays open for the row (it is the only way to the match menu).
   */
  const noTopBar = bigBoard && wide && !lp && !compactHud;
  const idleCollapsed = collapsedColumns(shownPanels, false, { [defendCol]: railDefend && defendTray != null });
  const actionsSide: PanelColumn | null = !noTopBar ? null : idleCollapsed.right && !idleCollapsed.left ? "left" : "right";
  const noLeftCol = wide && !lp && collapsed.left && actionsSide !== "left";
  const noRightCol = wide && !lp && collapsed.right && actionsSide !== "right";
  /** Columns on screen on a desktop board: only these can be shortened from their bottom edge (#633). */
  const cutColumns: Record<PanelColumn, boolean> = {
    left: wide && !lp && !noLeftCol && singleSide !== "right",
    right: wide && !lp && !noRightCol && singleSide !== "left",
  };
  const shownCuts = {
    left: cutColumns.left ? panelResize.shown.cuts.left : undefined,
    right: cutColumns.right ? panelResize.shown.cuts.right : undefined,
  };
  /** A shortened column and the fan in its default spot: the hand sits in the corner below the column, never over the board. */
  const fanCorner = fanCornerFor({
    fan: fanHand,
    spectatorFan: specFans != null,
    moved: shownFanPos != null,
    cuts: shownCuts,
  });
  const arenaStyle: CSSProperties | undefined =
    wide && !lp
      ? ({
          ...panelResize.arenaStyle(shownPanels, cutColumns),
          // The one column holds the Turn panel too, so on the left it opens as wide as the right one does.
          ...(singleSide === "left" && panelResize.shown.widths.left == null
            ? { "--left-w": bigBoard ? "clamp(250px, 17vw, 330px)" : "clamp(260px, 22vw, 400px)" }
            : null),
          ...(noLeftCol ? { "--left-w": "0px" } : null),
          ...(noRightCol ? { "--rail-w": "0px" } : null),
        } as CSSProperties)
      : undefined;
  const docked = wide && !lp && !spectating && !over && !sideActions;
  const mulliganBody =
    mulliganPhase && !spectating ? (
      view.you.mulliganDone ? (
        <>
          <strong>Mulligan locked in.</strong> Waiting for the other seat
          {view.opponent.mulliganDone ? "" : " — pass the device if this is hotseat"}.
        </>
      ) : !prefs.gameHints ? null : (
        <>
          <strong>
            {firstSeatLine({
              youFirst,
              boardSeat,
              pickedBy: firstSeatPickedBy,
              opponentName: seatName(players, oppSeat) ?? undefined,
            })}
          </strong>{" "}
          {youFirst
            ? "No draw and 1 DON!! on your first turn."
            : "You draw and get 2 DON!! on your first turn."}{" "}
          <strong>Opening hand:</strong> keep these 5 cards, or mulligan to
          shuffle them back and draw a new hand of 5. Life is dealt after both
          players decide.
        </>
      )
    ) : null;
  function renderColumnPanels(column: PanelColumn) {
    const ids = shownPanels[column];
    const sized = ids.some((id) => panelResize.shown.heights[id] != null);
    const panels = ids.map((id, i) =>
      renderSidePanel(id, i > 0 ? ids[i - 1]! : null, i === ids.length - 1, sized),
    );
    const after = ids.indexOf("turn") + 1;
    // Answering an attack: the defend tray rides under Turn and clocks (not movable).
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
        // The computer's action row carries its own Full screen button; phones keep it in the menu.
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
  /** The no-top-bar action row: same buttons as the phone bar, a fixed height so nothing moves when one comes or goes. */
  const columnActions = <BoardHud variant="column" {...hudProps} />;

  return (
    <MatchViewerSeatContext.Provider value={spectating ? null : boardSeat}>
    <PromptSlotContext.Provider value={promptSlotValue}>
    <DonArtContext.Provider value={donArtForSeat}>
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${oppActive ? " opp-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }${wide ? " arena-wide" : ""}${lp ? " arena-lp" : ""}${docked ? " arena-docked" : ""}${sideActions ? " arena-side-actions" : ""}${logPoseSide ? ` arena-lp-dock-${logPoseSide}` : ""}${fanCenter && !fanCorner ? " arena-fan-center" : ""}${fanCorner ? " arena-fan-corner" : ""}${specFans === "desktop" ? ` arena-spec-fans${farTop ? " arena-fan-top" : ""}` : ""}${
        specFans === "landscape" ? " arena-spec-lp" : ""
      }${specGrid ? " arena-spec-grid" : ""}${
        tilted ? " arena-tilt" : ""
      }${singleSide ? " arena-single-col" : ""}${bigBoard ? " arena-big" : ""}${noTopBar ? " arena-no-hud" : ""}${noLeftCol ? " arena-no-left" : ""}${noRightCol ? " arena-no-right" : ""}${prefs.donUpright ? " don-upright" : ""}${prefs.totalPower ? " power-total" : ""}`}
      // Read by the e2e click-through tests (duel-web/e2e) to follow the game.
      data-phase={view.phase}
      data-turn={view.turnNumber}
      data-seat={boardSeat}
      style={arenaStyle}
      ref={rootRef}
    >
      {previewPopup ? <CardPreviewPopup /> : null}
      {lp || noTopBar ? null : <BoardHud variant={compactHud ? "compact" : "full"} {...hudProps} />}

      {settingsOpen ? <GameplaySettingsSheet onClose={() => setSettingsOpen(false)} spectating={spectating} /> : null}

      {helpOpen ? <HotkeyHelpSheet onClose={() => setHelpOpen(false)} /> : null}

      <UndoRequestBanner ui={undoUi} players={players} />

      {awayLeft ? (
        <div className="away-banner" role="status">
          <strong>{seatName(players, oppSeat) ?? "Your opponent"} disconnected.</strong> Waiting{" "}
          {awayLeft} for them to reconnect — after that the match is yours.
        </div>
      ) : null}

      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}

      {copilot.pill}

      {mulliganBody && !sideActions ? (
        <div
          className={`mulligan-banner${view.you.mulliganDone ? "" : " mulligan-banner-explainer"}`}
          role="status"
        >
          {mulliganBody}
        </div>
      ) : null}

      <div className="arena-body" ref={arenaBodyRef}>
        {panelDrag.overlay}
        {lp ? (
          <LandscapeRail
            open={logPoseOpen ? "brief" : lpPanel}
            onToggle={(panel) => {
              if (panel === "brief") {
                setLpPanel(null);
                if (logPoseOpen) lpAnalyst.closePanel();
                else lpAnalyst.openPanel();
              } else {
                lpAnalyst.closePanel();
                setLpPanel((cur) => (cur === panel ? null : panel));
              }
            }}
            hasBrief={logPoseEntry === "button"}
            briefBusy={brief.busy || copilot.running}
            hasChat={chatPanel != null}
            logCount={battleLog.length}
            menu={matchMenuEl("left")}
          />
        ) : wide ? (
          <aside className="arena-left board-col" data-panel-col="left" data-col-off={singleSide === "right" ? "" : undefined} data-col-cut={shownCuts.left != null ? "" : undefined} aria-label="Side panels, left">
            {actionsSide === "left" ? columnActions : null}
            {renderColumnPanels("left")}
            {prefs.layoutGrips ? (
              <div className="col-resize col-resize-left" {...panelResize.columnHandleProps("left")} />
            ) : null}
          </aside>
        ) : null}

        <div className="playmat" ref={playmatRef} data-mat-drop={wide && !lp ? "" : undefined}>
          <div className="playmat-inner">
            {farHand && specFans === "portrait" ? (
              <SpectatorFarHand cards={farHand} ownerSeat={oppSeat} mode="portrait" name={seatLabel(players, oppSeat)} />
            ) : farHand && specFans === "desktop" ? null : oppHandOnMat ? (
              <div
                className={`opp-hand-mat opp-hand-mat-${oppHandOnMat}${oppHandOnMat === "centre" ? "" : " opp-hand-mat-side"}`}
              >
                <SidePanel
                  id="oppHand"
                  dragging={panelDrag.draggingId === "oppHand"}
                  grip={prefs.layoutGrips ? panelDrag.gripProps("oppHand") : null}
                >
                  <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="mat" cards={shownFarHand} ownerSeat={oppSeat} />
                </SidePanel>
              </div>
            ) : oppHandRight ? (
              <div className="opp-hand-hint opp-hand-hint-right">
                <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" cards={shownFarHand} ownerSeat={oppSeat} />
              </div>
            ) : (
              <OppHandHint count={opp.handCount} cardBackUrl={oppCardBackUrl} cards={shownFarHand} ownerSeat={oppSeat} />
            )}

            <SideField
              side="opp"
              lifeFan={prefs.lifeFan}
              compact
              countRow={portraitMat}
              turnOrder={firstSeat === oppSeat ? "first" : "second"}
              activeTurn={oppActive}
              matImageUrl={oppMatUrl}
              cardBackUrl={oppCardBackUrl}
              donArtUrl={farDonUrl}
              matDim={playmatDim}
              matOpacity={playmatOpacity}
              ownerSeat={oppSeat}
              viewingSeat={viewingSeat}
              data={{
                leader: opp.leader,
                characters: opp.characters,
                stage: opp.stage,
                deckCount: opp.deckCount,
                trash: opp.trash,
                lifeCount: opp.lifeCount,
                faceUpLife: lifeFaceUp(oppSeat, opp.faceUpLife),
                donDeckCount: opp.donDeckCount,
                costAreaCount: opp.costAreaCount,
                activeDonCount: opp.activeDonCount,
              }}
              target={
                attackTargetIds.size > 0
                  ? { targetableIds: attackTargetIds, onSelectTarget: selectAttackTarget }
                  : undefined
              }
              battleDrop={
                dragPayload?.type === "attack"
                  ? { kind: "attack", ids: attackTargetIds }
                  : undefined
              }
            />

            <div className={`midline${docked && midlineShown ? " midline-docked" : ""}`}>
              {midlineShown ? (
                <div className={`prompt${midlineBattle ? " prompt-battle" : ""}`} title={midlineTitle ?? undefined}>
                  <span className="prompt-text">{midlineShown}</span>
                </div>
              ) : rotateHintShown ? (
                <RotateHint onClose={closeRotateHint} />
              ) : null}
            </div>

            <SideField
              side="you"
              lifeFan={prefs.lifeFan}
              compact={simpleOwnBoard}
              countRow={simpleOwnBoard}
              turnOrder={youFirst ? "first" : "second"}
              activeTurn={youActive}
              matImageUrl={skins.near.playmat}
              matDim={playmatDim}
              matOpacity={playmatOpacity}
              cardBackUrl={skins.near.cardBack}
              donArtUrl={nearDonUrl}
              ownerSeat={boardSeat}
              viewingSeat={viewingSeat}
              data={{
                leader: you.leader,
                characters: you.characters,
                stage: you.stage,
                deckCount: you.deckCount,
                trash: you.trash,
                lifeCount: you.lifeCount,
                faceUpLife: lifeFaceUp(boardSeat, you.faceUpLife),
                donDeckCount: you.donDeckCount,
                costArea: you.costArea,
                activeDonCount: you.activeDonCount,
              }}
              donPile={
                spectating
                  ? undefined
                  : { piles: donPiles, onMove: moveDonToPile }
              }
              select={
                spectating
                  ? undefined
                  : {
                      selectedId: selectedBoardId,
                      onSelect: selectBoardCard,
                      actionableIds: actionableBoardIds,
                    }
              }
              attackReadyIds={attackReadyIds}
              attackDrag={
                draggableAttackerIds.size > 0
                  ? {
                      draggableIds: draggableAttackerIds,
                      onDragStart: (id) => setDragPayload({ type: "attack", attackerId: id }),
                      onDragEnd: (id, x, y) =>
                        commitDrop({ type: "attack", attackerId: id }, x, y),
                      onDragCancel: () => setDragPayload(null),
                    }
                  : undefined
              }
              battleDrop={
                dragPayload?.type === "counter" && counterDefenderId
                  ? { kind: "counter", ids: new Set([counterDefenderId]) }
                  : undefined
              }
              drag={
                dndEnabled
                  ? {
                      draggableDonIds,
                      draggingDonIds:
                        dragPayload?.type === "give_don"
                          ? new Set(dragPayload.donIds)
                          : EMPTY_IDS,
                      selectedDonIds,
                      onDonDragStart: (donId) => {
                        // Dragging a selected chip carries the whole selection;
                        // dragging an unselected chip selects just that one.
                        const donIds =
                          selectedDonIds.size > 0 && selectedDonIds.has(donId)
                            ? Array.from(selectedDonIds)
                            : [donId];
                        setSelectedDonIds(new Set(donIds));
                        setPendingAttach(null);
                        setDragPayload({ type: "give_don", donIds });
                      },
                      onDonDragEnd: (donId, x, y) => {
                        const donIds =
                          dragPayload?.type === "give_don" ? dragPayload.donIds : [donId];
                        commitDrop({ type: "give_don", donIds }, x, y);
                      },
                      onDonDragCancel: () => setDragPayload(null),
                      onDonToggleSelect: toggleDonSelect,
                      onClearDonSelection: clearDonSelection,
                      giveDonHighlightIds,
                      playTrashHighlightIds,
                      playFieldHighlight,
                    }
                  : undefined
              }
            />
          </div>
          {sideActions ? (
            <div className="side-dock" data-side-dock>
              <PrimaryDock
                inline
                primary={over ? null : dock.primary}
                extras={over ? [] : dock.extras}
                keyOffset={cardIntents.length}
                waiting={oppWait}
                view={view}
                disabled={over}
                confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
                defend={defendPrimary}
                counterLabel={counterLabel}
                onSend={sendPrimary}
              />
              <div className="dock-caption" role="status">
                {mulliganBody ? (
                  <p className="dock-caption-mulligan">{mulliganBody}</p>
                ) : midlineShown ? (
                  <div className={`prompt${midlineBattle ? " prompt-battle" : ""}`} title={midlineTitle ?? undefined}>
                    <span className="prompt-text">{midlineShown}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {wide && !lp ? (
          <div className="arena-rail board-col" data-panel-col="right" data-col-off={singleSide === "left" ? "" : undefined} data-col-cut={shownCuts.right != null ? "" : undefined}>
            {actionsSide === "right" ? columnActions : null}
            {renderColumnPanels("right")}
            {prefs.layoutGrips ? (
              <div className="col-resize col-resize-right" {...panelResize.columnHandleProps("right")} />
            ) : null}
            {/* Reserves the strip the collapsed hand dock peeks into. */}
            {railHand || fanHand ? null : <div className="rail-dock-spacer" aria-hidden />}
          </div>
        ) : wide ? (
          // Landscape phones keep a fixed right column (no movable panels).
          <div className="arena-rail board-col">
            {hotseatPass || (undo && undoState?.enabled && !spectating && !over) ? (
              <div className="lp-actions">
                <HudUndoPass ui={undoUi} hidden={undoPendingTheirs || (compactHud && undoNothingYet)} spectating={spectating} over={over} hotseatPass={hotseatPass} />
              </div>
            ) : null}
            {farHand && specFans === "landscape" ? (
              <SpectatorFarHand
                cards={farHand}
                ownerSeat={oppSeat}
                mode="landscape"
                name={seatLabel(players, oppSeat)}
              />
            ) : oppHandRight ? (
              <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" cards={shownFarHand} ownerSeat={oppSeat} />
            ) : (
              <OppHandFan
                count={opp.handCount}
                cardBackUrl={oppCardBackUrl}
                compact
                cards={shownFarHand}
                ownerSeat={oppSeat}
              />
            )}
            {/* Answering an attack: the tray gets the whole column (the turn card repeats it). */}
            {defendTray ? null : (
              <TurnStatusPanel
                view={view}
                boardSeat={boardSeat}
                firstSeat={firstSeat}
                players={players}
                spectating={spectating}
                turnClock={turnClock}
                matchClock={matchClock}
                seatClocks={seatClocks}
                compact
              />
            )}
            {defendTray ?? sidePanels.hand}
            {intentPanel}
          </div>
        ) : (
          <div className="arena-rail">
            {defendTray ?? (
              <div className={`hand-rail${handCollapsed && !handPick ? " collapsed" : ""}`}>
                <div className={`hand-rail-head${specFans && nearHand ? " hand-rail-head-spec" : ""}`}>
                  {specFans && nearHand ? (
                    <HandLabel name={seatLabel(players, boardSeat)} count={handCount} />
                  ) : (
                    <>
                      {spectating ? (
                        <>
                          <span className="hand-rail-title">{nearHand ? "Seat hand" : "Seat hand (hidden)"}</span>
                          <span className="hand-rail-count">{handCount}</span>
                        </>
                      ) : (
                        // The whole title row is a Hide / Show target too (#445): it stays
                        // put and the same size while the hand folds, unlike the small button.
                        <button
                          type="button"
                          className="hand-rail-toggle"
                          aria-expanded={!(handCollapsed && !handPick)}
                          aria-label={`${handCollapsed && !handPick ? "Show" : "Hide"} your hand, ${handCount} cards`}
                          onClick={toggleHandCollapsed}
                        >
                          <span className="hand-rail-title">Hand</span>
                          <span className="hand-rail-count">{handCount}</span>
                        </button>
                      )}
                    </>
                  )}
                  {!spectating ? (
                    <div className="hand-rail-actions">
                      {sortHandBtn}
                      <button
                        type="button"
                        className="hand-rail-btn hand-collapse-btn"
                        onClick={toggleHandCollapsed}
                      >
                        {handCollapsed && !handPick ? "Show" : "Hide"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {phoneFan ? (
                  <div className="hand-row hand-row-fan" ref={handRowRef}>
                    <div
                      className="hand-row-inner hand-fan-cards"
                      style={{ "--n": Math.max(handCount, 1) } as CSSProperties}
                    >
                      {renderHandCards(true)}
                    </div>
                  </div>
                ) : (
                  <div className={`hand-row${specGrid ? " hand-row-spec-grid" : ""}`} ref={handRowRef}>
                    <div className="hand-row-inner">{renderHandCards()}</div>
                  </div>
                )}
              </div>
            )}

            {intentPanel}

            <BattleLogPanel
              entries={battleLog}
              viewingSeat={spectating || mySeat == null ? undefined : mySeat}
              collapsed={logCollapsed}
              onToggle={() => setLogCollapsed((v) => !v)}
            />

            {chatPanel}
          </div>
        )}
      </div>

      {lp && lpPanel && !(lpPanel === "chat" && chatPanel == null) ? (
        <LandscapeOverlay
          panel={lpPanel}
          onClose={() => setLpPanel(null)}
        >
          {lpPanel === "log" ? (
            <BattleLogPanel
              entries={battleLog}
              viewingSeat={spectating || mySeat == null ? undefined : mySeat}
              alwaysOpen
            />
          ) : (
            chatPanel
          )}
        </LandscapeOverlay>
      ) : null}

      <SpectatorFanLayer
        specFans={specFans}
        fanMove={fanMove}
        farMove={farMove}
        playmatRef={playmatRef}
        farHand={farHand}
        farRef={farRef}
        shownFarPos={shownFarPos}
        farUp={farUp}
        farTuckUnderPointer={farTuckUnderPointer}
        farHoverUp={farHoverUp}
        setFarHoverUp={setFarHoverUp}
        setFarTuckUnderPointer={setFarTuckUnderPointer}
        players={players}
        oppSeat={oppSeat}
        dropHandClickFocus={dropHandClickFocus}
        specGrip={specGrip}
        specHandToggle={specHandToggle}
      />

      {(["left", "right"] as const).map((col) =>
        prefs.layoutGrips && cutColumns[col] ? (
          <div
            key={col}
            className={`col-cut col-cut-${col}${shownCuts[col] != null ? " has-cut" : ""}`}
            {...panelResize.cutHandleProps(col)}
          />
        ) : null,
      )}

      <HandDockLayer
        fanHand={fanHand}
        fanRef={fanRef}
        handRowRef={handRowRef}
        fanCorner={fanCorner}
        shownFanPos={shownFanPos}
        fanFloating={fanFloating}
        fanMove={fanMove}
        drawer={drawer}
        drawerClass={drawerClass}
        handOpen={handOpen}
        handUp={handUp}
        handHidden={handHidden}
        handTucked={handTucked}
        tuckUnderPointer={tuckUnderPointer}
        setTuckUnderPointer={setTuckUnderPointer}
        fanHoverUp={fanHoverUp}
        setFanHoverUp={setFanHoverUp}
        handCount={handCount}
        specFans={specFans}
        players={players}
        boardSeat={boardSeat}
        spectating={spectating}
        prefs={prefs}
        wide={wide}
        railHand={railHand}
        setHandHidden={setHandHidden}
        setHandPinned={setHandPinned}
        toggleHandUp={toggleHandUp}
        dropHandClickFocus={dropHandClickFocus}
        specGrip={specGrip}
        specHandToggle={specHandToggle}
        sortHandBtn={sortHandBtn}
        hideHandBtn={hideHandBtn}
        renderHandCards={renderHandCards}
      />

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
          keyOffset={cardIntents.length}
          waiting={oppWait}
          view={view}
          disabled={over}
          confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
          defend={defendPrimary}
          counterLabel={counterLabel}
          onSend={sendPrimary}
        />
      ) : null}

      {/* Fixed overlays (portals) — never participate in board layout. */}
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
      />
    </div>
    </DonArtContext.Provider>
    </PromptSlotContext.Provider>
    </MatchViewerSeatContext.Provider>
  );
}
