import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ChatLine, DiceAction, DiceResult, DiceStateMessage, Intent, MatchOverMessage, PlayerView, Seat, SeatPlayers, SeatSkin, TimerMessage } from "../net/protocol";
import { BattleLogPanel } from "./panels/BattleLogPanel";
import { CardPreviewPopup } from "./preview/CardPreviewPopup";
import { MatchViewerSeatContext } from "./zones/artOwnership";
import { PromptSlotContext } from "./prompts/promptSlot";
import { ChatPanel } from "./panels/ChatPanel";
import type { BattleLogEntry } from "./match/battleLog";
import { describeMatchResult } from "./match/matchResult";
import { type DragPayload } from "./combat/dragIntents";
import { describeBattle } from "./combat/battleBanner";
import { battleEndpoints } from "./combat/battleArc";
import { useScreenWakeLock } from "./layout/wakeLock";
import { type CardActionButton } from "./BoardOverlays";
import { cardActionText, splitCardActions } from "./input/cardActions";
import { handConfirmAnchor, handUseFromIntent, measureHandCard, type HandUse } from "./hand/handPrompt";
import { isHandPick } from "./prompts/fieldTargets";
import { spectatorFans, spectatorHandGrid, usesPhoneFan, usesRailHand, usesWideFan } from "./hand/handLayout";
import { useSideDockPlacement } from "./panels/sideDockPlacement";
import { waitingOnOpponent } from "./match/waitingOnOpponent";
import { useHudHeight } from "./layout/useHudHeight";
import { filterIntentsForSelection } from "./prompts/intentFilter";
import { dockIntents, splitPrimaryIntent } from "./prompts/primaryIntent";
import { DonArtContext, donArtUrl } from "./don/donArt";
import { lookupCard } from "../cards/atlas";
import { useCardBackUrl } from "../cardBack";
import { usePlaymatUrl } from "../playmat";
import { sideSkins } from "./layout/seatSkins";
import { updateSettings, useDuelSettings } from "../settings";
import { usePhoneResize } from "./panels/usePhoneResize";
import { fanDocked } from "./hand/handFanPos";
import { fanCornerFor } from "./hand/fanCorner";
import { type LoadMatchRecord } from "./match/MatchOverFacts";
import { useFanFit } from "./hand/useFanFit";
import { GameplaySettingsSheet } from "./settings/GameplaySettings";
import { HotkeyHelpSheet } from "./input/HotkeyHelp";
import { actionKeyTags, stepHandSelection } from "./input/hotkeys";
import { useBoardHotkeys, useConfirmButtonKey } from "./input/useBoardHotkeys";
import { buzz } from "./audio/haptics";
import { DicePhase } from "./match/DicePhase";
import { playerLabel, seatLabel, seatName } from "./match/playerNames";
import { PendingBoard, type BoardWaiting } from "./PendingBoard";
import { handDrawer } from "./hand/handFanGeometry";
import { farHandWithReveals, revealedIdSet } from "./hand/handReveal";
import type { ArtToggle } from "./prompts/HideArtItems";
import { LandscapeRail, LandscapeOverlay } from "./layout/LandscapeRail";
import type { BriefTicketWire } from "../net/protocol";
import { handIndexOf } from "./prompts/intentFields";
import { promptShortLine } from "./prompts/promptLine";
import { BoardHud } from "./hud/BoardHud";
import { type BoardRematch } from "./match/MatchResultView";
import { HandDockLayer } from "./hand/HandDockLayer";
import { SpectatorFanLayer } from "./hand/SpectatorFanLayer";
import { UndoRequestBanner } from "./match/UndoRequestBanner";
import { deriveUndoUi, type BoardUndo } from "./match/undoHud";
import { useBoardAudio } from "./audio/useBoardAudio";
import { useBoardLayout } from "./layout/useBoardLayout";
import { useBoardPanels } from "./panels/useBoardPanels";
import { useDefendFlow } from "./combat/useDefendFlow";
import { useDonSelection } from "./don/useDonSelection";
import { RestartNotice } from "./match/RestartNotice";
import { useFanState } from "./hand/useFanState";
import { useFullscreen } from "./layout/useFullscreen";
import { useHandArrangement } from "./hand/useHandArrangement";
import { formatCountdown, seatClockLabels, useClockNow } from "./match/useMatchClocks";
import { useOppPlayPreview } from "./motion/useOppPlayPreview";
import { useOrientationHint } from "./layout/useOrientationHint";
import { usePromptState } from "./prompts/usePromptState";
import { mulliganBodyFor, mulliganOpeningFor } from "./match/mulliganBody";
import { splashMessageFor } from "./motion/splashMessage";
import { ghostPayloadFor } from "./combat/ghostPayload";
import { renderHandCardsFor } from "./hand/handCards";
import { specGripFor, specHandToggleFor } from "./hand/specHandChrome";
import { BoardDefendTray } from "./combat/BoardDefendTray";
import { useBoardSelection } from "./input/useBoardSelection";
import { PlaymatBoard } from "./zones/PlaymatBoard";
import { useMatchAssist } from "./match/useMatchAssist";
import { useHandRowWheel } from "./hand/useHandRowWheel";
import { buildSidePanels, columnGeometry, renderColumnPanelsFor } from "./panels/boardColumns";
import { useFanPlacement } from "./hand/useFanPlacement";
import { BoardOverlayLayers } from "./BoardOverlayLayers";
import { BoardIntentPanel } from "./prompts/BoardIntentPanel";
import { boardChrome } from "./hud/boardChrome";
import { LandscapeSideRail } from "./layout/LandscapeSideRail";
import { PortraitRail } from "./layout/PortraitRail";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  /** The server announced a restart that will end this game. */
  serverRestart?: { seconds: number } | null;
  matchOver: MatchOverMessage["result"] | null;
  players?: SeatPlayers | null;
  timer?: TimerMessage | null;
  spectator?: boolean;
  battleLog?: BattleLogEntry[];
  hotseatPass?: { otherSeat: Seat; onPass: () => void };
  vsHuman?: boolean;
  canReport?: boolean;
  chat?: { lines: readonly ChatLine[]; onSend: (text: string) => void };
  onConcede?: () => void;
  onHandOrder?: (ids: string[]) => void;
  undo?: BoardUndo;
  loadMatchRecord?: LoadMatchRecord;
  rematch?: BoardRematch;
  opponentAwayUntil?: number | null;
  seatSkins?: readonly [SeatSkin | null, SeatSkin | null];
  leaveLabel?: string;
  replay?: { controls: ReactNode; quiet: boolean };
  matchBrief?: {
    brief: BriefTicketWire | null;
    ranked: boolean | null;
    ticketSeat?: Seat;
  };
  firstSeatPickedBy?: Seat | null;
  firstSeatDice?: DiceResult | null;
  dicePhase?: { state: DiceStateMessage; onAction: (action: DiceAction) => void };
  floatingPrompts?: boolean;
  waiting?: BoardWaiting;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

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
  serverRestart = null,
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
  firstSeatDice,
  dicePhase,
  floatingPrompts = true,
  waiting,
  onSendIntent: sendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [handUse, setHandUse] = useState<HandUse | null>(null);
  const noteAnsweredRef = useRef<((intent: Intent) => void) | null>(null);
  function onSendIntent(intent: Intent) {
    noteAnsweredRef.current?.(intent);
    if (intent.type === "declare_block") setQueuedCounter(null);
    if (view && handIndexOf(intent) !== undefined) {
      setHandUse(handUseFromIntent(intent, view.you.hand, measureHandCard));
    }
    sendIntent(intent);
  }
  const clearSelection = () => {
    setHandFilter(null);
    setSelectedBoardId(null);
  };
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const prefs = useDuelSettings();
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
  const [handHiddenRaw, setHandHidden] = useState(false);
  const handPick = !spectator && !view?.spectator && isHandPick(view?.pendingChoices?.[0], seat ?? view?.seat ?? null);
  const handHidden = handHiddenRaw && prefs.keepHandOpen && !handPick;
  const { wide, compactHud, portraitMat, simpleOwnBoard, lp, lpFan, railHandTall, handLayout, tilted } = useBoardLayout(prefs, isReplay);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useHudHeight(rootRef, wide, view != null);
  const arenaBodyRef = useRef<HTMLDivElement | null>(null);
  const playmatRef = useRef<HTMLDivElement | null>(null);
  const { singleSide, logPoseSide, setLogPoseHostL, setLogPoseHostR, panelLayout, panelDrag, panelResize, lpPanel, setLpPanel } =
    useBoardPanels({ prefs, wide, lp, dragPayload, arenaBodyRef });
  const phoneResize = usePhoneResize(prefs.panelSizesPhone, (next) => updateSettings({ panelSizesPhone: next }));
  const [promptSlot, setPromptSlot] = useState<HTMLElement | null>(null);
  const promptSlotValue = useMemo(() => ({ slot: promptSlot, setSlot: setPromptSlot }), [promptSlot]);
  const specFans = spectatorFans(Boolean((spectator || view?.spectator) && view?.revealedHands), wide, lp);
  const specGrid = spectatorHandGrid(specFans);
  const fanHand = usesWideFan(wide, lp, lpFan, specFans, handLayout);
  const {
    fanRef,
    farRef,
    fanMove,
    farMove,
    shownFanPos,
    shownFarPos,
    fanFloating,
    handUp,
    setFarPinned,
    setFarFloatTucked,
    farTuckUnderPointer,
    setFarTuckUnderPointer,
    farHoverUp,
    setFarHoverUp,
    farUp,
    farTop,
    fanCenter,
  } = useFanPlacement({ prefs, specFans, fanHand, playmatRef, floatTucked, handPinned });
  const railHand = usesRailHand(wide, lp, railHandTall, fanHand);
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

  useEffect(() => {
    setHandPinned(prefs.keepHandOpen);
    setHandHidden(false);
  }, [prefs.keepHandOpen, setHandPinned]);

  useHandRowWheel(handRowRef, handCollapsed, wide, railHand, view?.you.hand.length);

  const previewOppSeat = useOppPlayPreview({ battleLog, seat, view, wide, lp });

  const over = matchOver != null || view?.winner != null;
  const midlineText = view
    ? view.pendingChoices?.length
      ? promptShortLine(view.pendingChoices[0])
      : view.battle
        ? describeBattle(view, (defId) => lookupCard(defId).name, !(spectator || view.spectator))
        : null
    : null;
  const midlineBattle = !!view?.battle && !view?.pendingChoices?.length;
  // Every pending prompt on phones already shows its sentence, so the midline would repeat it; it still blocks other hints from using the strip.
  // Beside the board the pop-up, the floating header or the intent bar carries the sentence for the seat that answers; the side-dock bubble would repeat it, clipped.
  const ownChoice = view?.pendingChoices?.[0] != null && !spectator && !view.spectator && view.pendingChoices[0].seat === (seat ?? view.seat);
  const midlineShown = view?.pendingChoices?.length && (!wide || ownChoice) ? null : midlineText;
  const midlineTitle = view?.pendingChoices?.length ? view.pendingChoices[0].prompt : midlineShown;
  useScreenWakeLock(!over);
  const [resultHidden, setResultHidden] = useState(isReplay);
  useEffect(() => {
    if (!over) setResultHidden(isReplay);
  }, [over, isReplay]);
  const mySeat = seat ?? view?.seat ?? null;
  // The gutter is reserved for the whole game (not tied to `over`) so the board never resizes when the buttons change.
  // The tilted board leans the mats in perspective, so the floating dock is kept in the strip.
  const sideActions = prefs.actionsBeside && wide && !lp && !spectating && !tilted;
  // The playmat only exists once the match view has arrived, so the placement effect re-runs then.
  useSideDockPlacement(playmatRef, sideActions && view != null);
  const { brief, copilot, logPoseEntry, lpAnalyst, logPoseOpen, logPoseButton } = useMatchAssist({
    matchBrief,
    spectating,
    matchId,
    view,
    over,
    lp,
    wide,
    battleLog,
    onSendIntent,
    seat,
    errorBanner,
  });
  const result = describeMatchResult({
    winner: matchOver?.winner ?? view?.winner,
    reason: matchOver?.reason ?? view?.winReason,
    youSeat: spectating || isReplay ? null : mySeat,
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

  const dragging = dragPayload != null;
  useEffect(() => {
    if (dragging) buzz("pickup");
  }, [dragging]);

  const dndEnabled = yourTurn && !spectating && !over && !mulliganPhase;
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
  const don = useDonSelection({
    view,
    intents,
    dndEnabled,
    dragPayload,
    selectedBoardId,
    replaceOpen,
    onSendIntent,
    clearSelection,
  });
  const { selectedDonIds, setPendingAttach, pendingAttach, donSelectActive, clearDonSelection, confirmAttach, quickCounts, quickAttach } = don;

  function toggleHandHidden() {
    setHandHidden((v) => !v);
    setHandFilter(null);
  }

  function dropHandClickFocus(e: ReactMouseEvent<HTMLElement>) {
    if (e.detail === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && e.currentTarget.contains(active)) active.blur();
  }

  function toggleHandUp() {
    if (fanFloating) setFloatTucked(handUp);
    else setHandPinned(!handUp);
    if (handUp) {
      setFanHoverUp(false);
      setHandFilter(null);
      setTuckUnderPointer(document.querySelector(".hand-fan:hover, .hand-dock:hover") != null);
    }
  }

  function toggleFarUp() {
    if (shownFarPos) setFarFloatTucked(farUp);
    else setFarPinned(!farUp);
    if (farUp) {
      setFarHoverUp(false);
      setFarTuckUnderPointer(farRef.current?.matches(":hover") ?? false);
    }
  }

  function toggleHandCollapsed() {
    setHandCollapsed((v) => !v);
    setHandFilter(null);
  }

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
    wide: wide && !railHand,
    cardKeys: wide && !lp,
    handHides: prefs.keepHandOpen,
    onEscape: () => {
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

  const reorderInHand = handReorder.reorder?.inZone === true;
  const handTucked = dragPayload != null && !reorderInHand;

  const sel = useBoardSelection({
    view,
    intents,
    prefs,
    spectating,
    dndEnabled,
    dragPayload,
    setDragPayload,
    handFilter,
    setHandFilter,
    selectedBoardId,
    setSelectedBoardId,
    counterDefenderId,
    replaceOpen,
    openReplace,
    defend,
    defendPrimary,
    trayHere,
    setStagedCounterIds,
    setStagedBlockerId,
    setQueuedCounter,
    donSelectActive,
    selectedDonIds,
    setPendingAttach,
    confirmAttach,
    clearDonSelection,
    onSendIntent,
  });
  const { commitDrop, pressCardAction, selectHandCard, attackWarn } = sel;


  useFanFit(
    fanRef,
    view ? (spectating ? (view.you.handCount ?? 0) : view.you.hand.length) : 0,
    fanHand && view != null,
    shownFanPos == null ? "centre" : fanMove.livePos || !fanDocked(shownFanPos) ? "float" : "docked",
  );
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
            invite: { roomId: matchId, autoCopy: seat === 0 && !spectating },
          }
        }
        dice={dicePhase ? <DicePhase state={dicePhase.state} onAction={dicePhase.onAction} /> : undefined}
        errorBanner={errorBanner}
        leaveLabel={leaveLabel}
        onLeave={onLeave}
        onClearError={onClearError}
      />
    );
  }

  const you = view.you;
  const opp = view.opponent;
  const handConfirm = spectating
    ? null
    : handConfirmAnchor(view.pendingChoices?.[0], mySeat, handUse, you);
  const promptBattle = (() => {
    const ends = wide && !lp ? battleEndpoints(view) : null;
    return ends ? { defenderId: ends.targetId, attackerId: ends.attackerId } : null;
  })();

  const ghostPayload = ghostPayloadFor({ reorderInHand, liftedHandId, dragPayload, you, mySeat, view });

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
  const nearHand = spectating ? view.revealedHands?.[boardSeat] : undefined;
  const farHand = spectating ? view.revealedHands?.[oppSeat] : undefined;
  const oppHandOnMat = wide && !lp && !farHand && prefs.oppHandSpot ? prefs.oppHandSpot : null;
  const oppHandRight = prefs.oppHandSpot === "right" && !farHand;
  const myRevealed = revealedIdSet(spectating ? undefined : view.handReveals?.[boardSeat]);
  const shownFarHand =
    farHand ?? (over || isReplay ? view.revealedHands?.[oppSeat] : farHandWithReveals(opp.handCount, view.handReveals?.[oppSeat]));
  const revealLife = over ? view.revealedLife : undefined;
  const lifeFaceUp = (seat: Seat, fallback: typeof opp.faceUpLife) =>
    revealLife ? revealLife[seat].map((defId, index) => ({ index, defId })) : fallback;
  const viewingSeat: Seat | undefined = spectating ? undefined : boardSeat;
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

  const splash = splashMessageFor({
    over,
    prefs,
    replayQuiet,
    mulliganPhase,
    decidingMulligan,
    spectating,
    matchId,
    boardSeat,
    youFirst,
    view,
    players,
    youActive,
  });

  const undoUi = deriveUndoUi(undo, boardSeat);

  const renderHandCards = (fanned = false) =>
    renderHandCardsFor(
      {
        view,
        you,
        prefs,
        spectating,
        nearHand,
        skins,
        boardSeat,
        viewingSeat,
        intents,
        yourTurn,
        handPick,
        handSorted,
        handDisplayIndices,
        handReorder,
        handFilter,
        myRevealed,
        liftedHandId,
        setLiftedHandId,
        dndEnabled,
        counterDragEnabled,
        defend,
        earlyCounterIds,
        selectHandCard,
        setDragPayload,
        commitDrop,
      },
      fanned,
    );
  const specChrome = {
    specFans,
    prefs,
    fanMove,
    farMove,
    players,
    boardSeat,
    oppSeat,
    handUp,
    farUp,
    handOpen,
    toggleHandUp,
    toggleFarUp,
  };
  const specGrip = (which: "near" | "far") => specGripFor(specChrome, which);
  const specHandToggle = (which: "near" | "far", count: number) => specHandToggleFor(specChrome, which, count);

  // Beside the board the attack summary heads the action area, above Pass block / Pass counter; the rail tray then skips its own copy.
  const dockHeading = sideActions && !over && defend != null ? defend : null;
  // The phone tray already opens with the same sentence, so the strip over the mats would only repeat it.
  const stripText = trayHere && defend != null && midlineBattle ? null : midlineShown;
  const defendTray =
    (trayHere || railDefend) && defend ? (
      <BoardDefendTray
        defend={defend}
        summary={dockHeading == null}
        railDefend={railDefend}
        trayHere={trayHere}
        handCount={handCount}
        boardSeat={boardSeat}
        timer={timer}
        now={now}
        prefs={prefs}
        intents={intents}
        you={you}
        setStagedBlockerId={setStagedBlockerId}
        setStagedCounterIds={setStagedCounterIds}
        skipBlockToCounter={skipBlockToCounter}
        onSendIntent={onSendIntent}
        setDragPayload={setDragPayload}
        commitDrop={commitDrop}
      />
    ) : null;

  const barIntents = (() => {
    const front = view.pendingChoices?.[0];
    if (front) {
      return view.legalIntents.filter(
        (i) => i.type !== "resolve_pending_choice" && i.type !== "order_pending_effects",
      );
    }
    return quickCounts.length > 0
      ? view.legalIntents.filter((i) => !(i.type === "give_don" && i.targetId === selectedBoardId))
      : view.legalIntents;
  })();
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

  const oppWait =
    spectating || over || hotseatPass ? null : waitingOnOpponent(view, mySeat);
  const sendPrimary = (intent: Intent) => {
    setHandFilter(null);
    setSelectedBoardId(null);
    onSendIntent(intent);
  };
  const mulliganDock = dockIntents(barIntents, { defending: false });
  // While you decide, Mulligan and Keep opening hand live under the opening hand in the middle of the board, so no other dock or bar repeats them.
  const dock = decidingMulligan ? { primary: null, extras: [] as Intent[] } : dockIntents(barIntents, { defending: defendPrimary != null });
  const intentPanel = (
    <BoardIntentPanel
      view={view}
      prefs={prefs}
      mySeat={mySeat}
      railDefend={railDefend}
      defendTray={defendTray}
      wide={wide}
      lp={lp}
      spectating={spectating}
      isReplay={isReplay}
      over={over}
      nearHand={nearHand}
      oppWait={oppWait}
      barIntents={barIntents}
      handFilter={handFilter}
      selectedBoardId={selectedBoardId}
      defendPrimary={defendPrimary}
      counterLabel={counterLabel}
      popoverOpen={popoverOpen}
      decidingMulligan={decidingMulligan}
      sendPrimary={sendPrimary}
      openReplace={openReplace}
      replay={replay}
      resultHidden={resultHidden}
      setResultHidden={setResultHidden}
      result={result}
      cardIntentCount={cardIntents.length}
    />
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
  const artToggles: ArtToggle[] = hotseatPass || !prefs.showOthersArt
    ? []
    : (spectating ? [boardSeat, oppSeat] : [oppSeat])
        .filter((s) => seatSkins?.[s]?.playmat || seatSkins?.[s]?.cardBack)
        .map((s) => ({ seat: s, name: spectating ? seatLabel(players, s) : seatName(players, s), hidden: hiddenArtSeats.has(s) }));
  const oppMatUrl = skins.far.playmat;
  const oppCardBackUrl = skins.far.cardBack;
  const nearDonUrl = donArtUrl(skins.near.donArt);
  const farDonUrl = donArtUrl(skins.far.donArt);
  const donArtForSeat = (s?: Seat) => (s != null && s === oppSeat && s !== boardSeat ? farDonUrl : nearDonUrl);

  const previewPopup = prefs.previewPopup && prefs.showCardPreview && wide && !lp;
  const sidePanels = buildSidePanels({
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
    setLogPoseHostR,
  });
  const { shownPanels, bigBoard, defendCol, noTopBar, actionsSide, noLeftCol, noRightCol, cutColumns, shownCuts, arenaStyle } = columnGeometry({
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
    phoneResize,
  });
  const fanCorner = fanCornerFor({
    fan: fanHand,
    spectatorFan: specFans != null,
    moved: shownFanPos != null,
    cuts: shownCuts,
  });
  const docked = wide && !lp && !spectating && !over && !sideActions;
  const mulliganBody = mulliganBodyFor({
    view,
    spectating,
    mulliganPhase,
  });
  const { mulliganOrder, mulliganHint } = mulliganOpeningFor({
    decidingMulligan,
    prefs,
    youFirst,
    boardSeat,
    oppSeat,
    players,
    firstSeatPickedBy,
    firstSeatDice,
  });
  const renderColumnPanels = renderColumnPanelsFor({
    shownPanels,
    sidePanels,
    panelResize,
    panelDrag,
    prefs,
    defendCol,
    railDefend,
    defendTray,
  });

  const { hudProps, matchMenuEl, columnActions, reportTargetFor, canReportPlayer } = boardChrome({
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
  });

  return (
    <MatchViewerSeatContext.Provider value={spectating ? null : boardSeat}>
    <PromptSlotContext.Provider value={promptSlotValue}>
    <DonArtContext.Provider value={donArtForSeat}>
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${oppActive ? " opp-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }${wide ? " arena-wide" : ""}${lp ? " arena-lp" : ""}${docked ? " arena-docked" : ""}${sideActions ? " arena-side-actions" : ""}${logPoseSide ? ` arena-lp-dock-${logPoseSide}` : ""}${fanCenter && !fanCorner ? " arena-fan-center" : ""}${fanCenter && !fanCorner && !specFans && prefs.keepHandOpen ? " arena-fan-kept" : ""}${fanCorner ? " arena-fan-corner" : ""}${specFans === "desktop" ? ` arena-spec-fans${farTop ? " arena-fan-top" : ""}` : ""}${
        specFans === "landscape" ? " arena-spec-lp" : ""
      }${specGrid ? " arena-spec-grid" : ""}${
        tilted ? " arena-tilt" : ""
      }${singleSide ? " arena-single-col" : ""}${bigBoard ? " arena-big" : ""}${noTopBar ? " arena-no-hud" : ""}${noLeftCol ? " arena-no-left" : ""}${noRightCol ? " arena-no-right" : ""}${prefs.donUpright ? " don-upright" : ""}${prefs.totalPower ? " power-total" : ""}`}
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

      {serverRestart && !over ? <RestartNotice seconds={serverRestart.seconds} /> : null}

      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}

      {copilot.pill}

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

        <PlaymatBoard
          playmatRef={playmatRef}
          view={view}
          prefs={prefs}
          players={players}
          boardSeat={boardSeat}
          oppSeat={oppSeat}
          viewingSeat={viewingSeat}
          firstSeat={firstSeat}
          youFirst={youFirst}
          youActive={youActive}
          oppActive={oppActive}
          spectating={spectating}
          isReplay={isReplay}
          over={over}
          wide={wide}
          lp={lp}
          portraitMat={portraitMat}
          simpleOwnBoard={simpleOwnBoard}
          docked={docked}
          sideActions={sideActions}
          mulliganBody={mulliganBody}
          mulligan={{ deciding: decidingMulligan, order: mulliganOrder, hint: mulliganHint }}
          dockHeading={dockHeading}
          specFans={specFans}
          farHand={farHand}
          oppHandOnMat={oppHandOnMat}
          oppHandRight={oppHandRight}
          shownFarHand={shownFarHand}
          oppCardBackUrl={oppCardBackUrl}
          oppMatUrl={oppMatUrl}
          farDonUrl={farDonUrl}
          nearDonUrl={nearDonUrl}
          skins={skins}
          lifeFaceUp={lifeFaceUp}
          panelDrag={panelDrag}
          midline={{ shown: midlineShown, strip: stripText, battle: midlineBattle, title: midlineTitle }}
          rotateHintShown={rotateHintShown}
          closeRotateHint={closeRotateHint}
          dndEnabled={dndEnabled}
          dragPayload={dragPayload}
          setDragPayload={setDragPayload}
          selectedBoardId={selectedBoardId}
          counterDefenderId={counterDefenderId}
          sel={sel}
          don={don}
          intentDock={{
            dock,
            mulliganDock,
            cardIntentCount: cardIntents.length,
            oppWait,
            defendPrimary,
            counterLabel,
            onSend: sendPrimary,
          }}
        />

        {wide && !lp ? (
          <div className="arena-rail board-col" data-panel-col="right" data-col-off={singleSide === "left" ? "" : undefined} data-col-cut={shownCuts.right != null ? "" : undefined}>
            {actionsSide === "right" ? columnActions : null}
            {renderColumnPanels("right")}
            {prefs.layoutGrips ? (
              <div className="col-resize col-resize-right" {...panelResize.columnHandleProps("right")} />
            ) : null}
            {railHand || fanHand ? null : <div className="rail-dock-spacer" aria-hidden />}
          </div>
        ) : wide ? (
          <LandscapeSideRail
            view={view}
            prefs={prefs}
            players={players}
            boardSeat={boardSeat}
            oppSeat={oppSeat}
            firstSeat={firstSeat}
            spectating={spectating}
            over={over}
            compactHud={compactHud}
            hotseatPass={hotseatPass}
            undo={undo}
            undoUi={undoUi}
            specFans={specFans}
            farHand={farHand}
            shownFarHand={shownFarHand}
            oppHandRight={oppHandRight}
            oppCardBackUrl={oppCardBackUrl}
            turnClock={turnClock}
            matchClock={matchClock}
            seatClocks={seatClocks}
            defendTray={defendTray}
            handPanel={sidePanels.hand}
            fanHand={fanHand}
            intentPanel={intentPanel}
            phoneResize={phoneResize}
          />
        ) : (
          <PortraitRail
            boardSeat={boardSeat}
            mySeat={mySeat}
            players={players}
            spectating={spectating}
            specFans={specFans}
            specGrid={specGrid}
            nearHand={nearHand}
            handCount={handCount}
            handCollapsed={handCollapsed}
            handPick={handPick}
            phoneFan={phoneFan}
            handRowRef={handRowRef}
            toggleHandCollapsed={toggleHandCollapsed}
            sortHandBtn={sortHandBtn}
            renderHandCards={renderHandCards}
            defendTray={defendTray}
            intentPanel={intentPanel}
            battleLog={battleLog}
            logCollapsed={logCollapsed}
            onToggleLog={() => setLogCollapsed((v) => !v)}
            chatPanel={chatPanel}
          />
        )}
      </div>

      {lp && lpPanel && !(lpPanel === "chat" && chatPanel == null) ? (
        <LandscapeOverlay
          panel={lpPanel}
          onClose={() => setLpPanel(null)}
          resizeProps={prefs.layoutGrips ? phoneResize.handleProps("overlay") : undefined}
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

      <BoardOverlayLayers
        view={view}
        prefs={prefs}
        intents={intents}
        spectating={spectating}
        isReplay={isReplay}
        over={over}
        wide={wide}
        lp={lp}
        mySeat={mySeat}
        boardSeat={boardSeat}
        players={players}
        matchId={matchId}
        hotseatPass={hotseatPass}
        floatingPrompts={floatingPrompts}
        replaceOpen={replaceOpen}
        replaceCardId={replaceCardId}
        replaceHandIndex={replaceHandIndex}
        setReplaceCardId={setReplaceCardId}
        handConfirm={handConfirm}
        hiddenChoiceId={hiddenChoiceId}
        setHiddenChoiceId={setHiddenChoiceId}
        promptBattle={promptBattle}
        onSendIntent={onSendIntent}
        clearSelection={clearSelection}
        replay={replay}
        docked={docked}
        dock={dock}
        oppWait={oppWait}
        defendPrimary={defendPrimary}
        counterLabel={counterLabel}
        sendPrimary={sendPrimary}
        splash={splash}
        attackWarn={attackWarn}
        reveals={reveals}
        spotlights={spotlights}
        previewOppSeat={previewOppSeat}
        ghostPayload={ghostPayload}
        dragPayload={dragPayload}
        popoverOpen={popoverOpen}
        anchorCard={anchorCard}
        popoverActions={popoverActions}
        handFilter={handFilter}
        quickCounts={quickCounts}
        quickAttach={quickAttach}
        pendingAttach={pendingAttach}
        dndEnabled={dndEnabled}
        pendingAttachName={pendingAttachName}
        confirmAttach={confirmAttach}
        clearDonSelection={clearDonSelection}
        resultHidden={resultHidden}
        setResultHidden={setResultHidden}
        result={result}
        matchOver={matchOver}
        loadMatchRecord={loadMatchRecord}
        rematch={rematch}
        canReportPlayer={canReportPlayer}
        reportTargetFor={reportTargetFor}
        onLeave={onLeave}
        cardIntentCount={cardIntents.length}
      />
    </div>
    </DonArtContext.Provider>
    </PromptSlotContext.Provider>
    </MatchViewerSeatContext.Provider>
  );
}
