import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type {
  ChatLine,
  Intent,
  MatchOverMessage,
  PlayerView,
  Seat,
  SeatPlayers,
  SeatSkin,
  RematchAction,
  RematchState,
  TimerMessage,
  UndoAction,
  UndoState,
} from "../net/protocol";
import { BattleLogPanel } from "./BattleLogPanel";
import { CardPreviewPanel } from "./CardPreviewPanel";
import { RecentPlaysStrip } from "./RecentPlaysStrip";
import { MatchViewerSeatContext } from "./artOwnership";
import { PromptSlotContext } from "./promptSlot";
import { ChatPanel } from "./ChatPanel";
import type { BattleLogEntry } from "./battleLog";
import { AttackWarning, type AttackWarn } from "./AttackWarning";
import { cantAttackReason } from "./attackBlock";
import { useAttackAttempt } from "./useAttackAttempt";
import { RevealOverlay, useOpponentReveals } from "./RevealOverlay";
import { CardSpotlightLayer, useCardSpotlights } from "./CardSpotlight";
import { describeMatchResult } from "./matchResult";
import { CardTile } from "./CardTile";
import {
  canDragDon,
  canDragAttacker,
  canDragCounter,
  canDragHandCard,
  canDropPlayOnField,
  findDropTargetAtPoint,
  giveDonTargetIdsForAll,
  playCardTrashTargetIds,
  playNeedsReplace,
  isReplacePlay,
  resolveDropIntents,
  type DragPayload,
} from "./dragIntents";
import { AttackIndicator, DragAttackArrow } from "./AttackIndicator";
import { BoardMotion } from "./BoardMotion";
import { describeBattle } from "./battleBanner";
import { battleEndpoints } from "./battleArc";
import { followUpCounter } from "./counterSkipBlock";
import { canOfferFullscreen, readInstallEnv } from "../installPrompt";
import { useScreenWakeLock } from "./wakeLock";
import {
  CardActionPopover,
  DonAttachConfirm,
  DragGhost,
  type CardActionButton,
  type GhostPayload,
} from "./BoardOverlays";
import {
  blockIntentFor,
  cardActionText,
  counterIntentForCard,
  counterIntentForHand,
  counterPrimaryLabel,
  splitCardActions,
} from "./cardActions";
import {
  attachTargetIds,
  beginAttach,
  donIdsForTarget,
  donQuickAttach,
  nextDonSelection,
  pruneDonSelection,
  quickAttachCounts,
  quickAttachLabel,
  resolveAttachIntents,
  type PendingAttach,
} from "./donSelection";
import { ChoicePrompt } from "./ChoicePrompt";
import { HandConfirmPrompt } from "./HandConfirmPrompt";
import { handConfirmAnchor, handUseFromIntent, measureHandCard, type HandUse } from "./handPrompt";
import { isHandPick } from "./fieldTargets";
import { SPECTATOR_FAN_SPREAD, spectatorFans, usesPhoneFan, usesRailHand } from "./handLayout";
import { SpectatorFarHand } from "./SpectatorFarHand";
import { EffectOrderPrompt } from "./EffectOrderPrompt";
import { canFloat, FloatingPrompt } from "./FloatingPrompt";
import { IntentBar } from "./IntentBar";
import { PrimaryDock } from "./PrimaryDock";
import { waitingOnOpponent } from "./waitingOnOpponent";
import { DefendTray } from "./DefendTray";
import { deriveDefend } from "./defendModel";
import { clockFraction, resolveStagedCounters } from "./defendTray";
import { ReplacePrompt } from "./ReplacePrompt";
import {
  attackTargetIdsForAttacker,
  findAttackIntent,
  filterIntentsForSelection,
  hasBoardActions,
} from "./intentFilter";
import { dockIntents, splitPrimaryIntent } from "./primaryIntent";
import { SideField } from "./SideField";
import { lookupCard } from "../cards/atlas";
import { sortHandIndices } from "./handSort";
import { moveToSlot, reconcileHandOrder } from "./handOrder";
import { useHandReorder } from "./useHandReorder";
import { useHandShuffle } from "./useHandShuffle";
import { useHandLift } from "./useHandLift";
import { cardBackCssValue, useCardBackUrl } from "../cardBack";
import { usePlaymatUrl } from "../playmat";
import { sideSkins } from "./seatSkins";
import { resolveHandLayout, updateSettings, useDuelSettings } from "../settings";
import { PANEL_LABELS, parsePanelLayout, serializePanelLayout, type PanelColumn, type PanelId } from "./panelLayout";
import { parsePanelSizes, serializePanelSizes } from "./panelSizes";
import { usePanelResize } from "./usePanelResize";
import { SidePanel, usePanelDrag } from "./SidePanels";
import { fanDocked, parseFanPos, serializeFanPos } from "./handFanPos";
import { MatchOverFactsList, type LoadMatchRecord } from "./MatchOverFacts";
import { useFanFit } from "./useFanFit";
import { useFanMove } from "./useFanMove";
import { endTurnWarning, responseStopPass } from "./gameplayPrefs";
import { GameplaySettingsSheet } from "./GameplaySettings";
import { HotkeyHelpSheet } from "./HotkeyHelp";
import { actionKeyTags, stepHandSelection } from "./hotkeys";
import { useBoardHotkeys, useConfirmButtonKey } from "./useBoardHotkeys";
import { audioUnlocked, unlockAudio, useTurnAlert } from "./turnAlert";
import { incomingAttackKey, useIncomingAttackCue } from "./attackCue";
import { useGameSfx } from "./sfx";
import { useSoundCues } from "./soundCues";
import { buzz } from "./haptics";
import {
  markRotateHintSeen,
  releaseOrientationLock,
  rotateHintSeen,
  shouldShowRotateHint,
  syncOrientationLock,
} from "./orientation";
import { RotateHint } from "./RotateHint";
import { handCardOutOfReach, needsDonHint } from "./handAffordance";
import { phaseLabel } from "./phaseLabel";
import { playerLabel, seatLabel, seatName, winnerHeadline } from "./playerNames";
import { ConfirmButton } from "./ConfirmButton";
import { RematchPanel } from "./RematchPanel";
import { RoomChip } from "./RoomShare";
import { PendingBoard, type BoardWaiting } from "./PendingBoard";
import { fanPose, handDrawer } from "./handFan";
import { OppHandCorner, OppHandFan, OppHandHint, TurnStatusPanel, type SeatClocks } from "./TurnStatusPanel";
import { TurnSplash, type SplashMessage } from "./TurnSplash";
import { getLastHoverAt, getPreviewCard, setAutoPreviewCard, shouldAutoPreview } from "./cardPreview";
import { latestOpponentPlay, opponentPlayCaption } from "./opponentPlay";
import { useMediaQuery, WIDE_BOARD_QUERY, COMPACT_HUD_QUERY, PORTRAIT_MAT_QUERY, LANDSCAPE_PHONE_QUERY, RAIL_HAND_QUERY, TILT_BOARD_QUERY } from "./useMediaQuery";
import { MatchMenu } from "./MatchMenu";
import { LandscapeRail, LandscapeOverlay, type LandscapePanel } from "./LandscapeRail";
import { matchMenuItems } from "./matchMenuItems";
import { isPromptHidden, promptOpenFor } from "./promptHide";
import { promptShortLine } from "./promptLine";
import { HideablePrompt, promptSourceName } from "./HideablePrompt";

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
  /** Online match chat. Omit (e.g. practice) to hide the chat panel. */
  chat?: { lines: readonly ChatLine[]; onSend: (text: string) => void };
  /** Online players: concede sits next to Leave in the HUD. */
  onConcede?: () => void;
  /**
   * Turn undo (private rooms / practice). `autoAccept` = the other seat is
   * also this player (practice), so no request / answer UI is shown.
   */
  undo?: { state: UndoState | null; onAction: (action: UndoAction) => void; autoAccept?: boolean };
  /**
   * Online ranked / casual matches: loads the saved match (History's entry) so the
   * match-over card can show the rating change and link the match log.
   */
  loadMatchRecord?: LoadMatchRecord;
  /** Rematch vote on the match-over screen (unranked rooms). */
  rematch?: {
    state: RematchState | null;
    onAction: (action: RematchAction) => void;
    autoAccept?: boolean;
  };
  /** Opponent dropped: epoch ms until which they may reconnect before forfeiting. */
  opponentAwayUntil?: number | null;
  /** Online: each seat's shared custom playmat / card back (shown for the opponent only). */
  seatSkins?: readonly [SeatSkin | null, SeatSkin | null];
  leaveLabel?: string;
  /** Searches and effect ordering float cards over the board instead of a pop-up (always in matches; `/demo?box` shows the pop-up fallback). */
  floatingPrompts?: boolean;
  /** Before the first view: what the empty board says (queueing, connecting, starting). */
  waiting?: BoardWaiting;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

const EMPTY_IDS = new Set<string>();

/** Your own Leader / Character / Stage by instance id (what the card popover anchors to). */
function findOwnCard(view: PlayerView, id: string): { id: string; defId: string } | null {
  if (view.you.leader.id === id) return view.you.leader;
  if (view.you.stage?.id === id) return view.you.stage;
  return view.you.characters.find((c) => c.id === id) ?? null;
}

function formatCountdown(endsAt: number | null | undefined, now: number): string | null {
  if (endsAt == null) return null;
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** Chess-clock readouts for both seats, or null when that mode is off. */
function seatClockLabels(
  timer: TimerMessage | null,
  now: number,
  youSeat: Seat,
  oppSeat: Seat,
): SeatClocks | null {
  if (!timer?.seatSeconds || !timer.seatRemainingMs) return null;
  const msFor = (seat: Seat) =>
    timer.clockSeat === seat && timer.clockEndsAt != null
      ? Math.max(0, timer.clockEndsAt - now)
      : Math.max(0, timer.seatRemainingMs![seat]);
  const fmt = (ms: number) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  const you = msFor(youSeat);
  const opp = msFor(oppSeat);
  return {
    you: fmt(you),
    opp: fmt(opp),
    youLow: you < 60_000,
    oppLow: opp < 60_000,
    running: timer.clockSeat === youSeat ? "you" : timer.clockSeat === oppSeat ? "opp" : null,
  };
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
  chat,
  onConcede,
  undo,
  opponentAwayUntil = null,
  seatSkins,
  rematch,
  loadMatchRecord,
  leaveLabel = "Leave",
  floatingPrompts = true,
  waiting,
  onSendIntent: sendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  /** Id of the choice whose pop-up the player tucked away to look at the hand/board. */
  const [hiddenChoiceId, setHiddenChoiceId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  /** Card last used from the hand and where it sat, for a Yes/No it asks next. */
  const [handUse, setHandUse] = useState<HandUse | null>(null);
  function onSendIntent(intent: Intent) {
    // Blocking after all: a skip-block Counter must not follow onto the Blocker.
    if (intent.type === "declare_block") setQueuedCounter(null);
    if (view && typeof intent.handIndex === "number") {
      setHandUse(handUseFromIntent(intent, view.you.hand, measureHandCard));
    }
    sendIntent(intent);
  }
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  /** Wide layout: hand dock pinned open (click / tap on its handle). */
  const prefs = useDuelSettings();
  const [handPinned, setHandPinned] = useState(prefs.keepHandOpen);
  /**
   * Keep hand open: the player tucked the hand fully away (H or its Hide
   * button). For this visit only, not saved: a reload brings the hand back.
   */
  const [handHiddenRaw, setHandHidden] = useState(false);
  /** An effect asks me to pick cards from my hand: they are tapped in the hand, so it stays in view. */
  const handPick = !spectator && !view?.spectator && isHandPick(view?.pendingChoices?.[0], seat ?? view?.seat ?? null);
  const handHidden = handHiddenRaw && prefs.keepHandOpen && !handPick;
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const compactHud = useMediaQuery(COMPACT_HUD_QUERY);
  const portraitMat = useMediaQuery(PORTRAIT_MAT_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  /** Landscape phone: icon rail + overlays on the left, slim action column on the right. */
  const lp = wide && landscapePhone;
  const [promptSlot, setPromptSlot] = useState<HTMLElement | null>(null);
  const promptSlotValue = useMemo(() => ({ slot: promptSlot, setSlot: setPromptSlot }), [promptSlot]);
  /** Tall desktop, Grid layout: the hand is an always-open grid side panel (no dock). */
  const railHandTall = useMediaQuery(RAIL_HAND_QUERY);
  /** "auto" (never chosen) is the Grid on a tall desktop window and the fan elsewhere. */
  const handLayout = resolveHandLayout(prefs.handLayout, wide && !lp && railHandTall);
  /**
   * Spectators of unranked rooms see both hands face up, always fanned: their
   * Hand setting (saved, untouched) only matters for hands they have to play.
   */
  const specFans = spectatorFans(Boolean((spectator || view?.spectator) && view?.revealedHands), wide, lp);
  /** Desktop: the hand fans off the bottom edge of the board (centre) or the rail (right). */
  const fanHand = wide && !lp && (specFans != null || handLayout !== "grid");
  /** Desktop fan: where the player dragged it (null = bottom centre of the board). */
  const fanPos = useMemo(() => parseFanPos(prefs.handFanPos), [prefs.handFanPos]);
  const fanRef = useRef<HTMLDivElement | null>(null);
  const fanMove = useFanMove(
    fanRef,
    fanPos,
    (next) => updateSettings({ handFanPos: serializeFanPos(next) }),
    () => {
      const r = document.querySelector(".arena .playmat")?.getBoundingClientRect();
      return r ? r.left + r.width / 2 : window.innerWidth / 2;
    },
  );
  // Spectators have no hand to rearrange: the fan stays at the bottom centre.
  const shownFanPos = specFans ? null : (fanMove.livePos ?? fanPos);
  /** Off the bottom edge: fully shown unless tucked to its handle ("Let the hand tuck away"). */
  const fanFloating = fanHand && shownFanPos != null && (fanMove.livePos != null || !fanDocked(shownFanPos));
  const [floatTucked, setFloatTucked] = useState(false);
  /**
   * Just tucked by its own button or H: the pointer is usually still on the
   * hand, so hover must not raise it again until the pointer has left it.
   */
  const [tuckUnderPointer, setTuckUnderPointer] = useState(false);
  /** Raised by the player (pin), as the hand button shows it. */
  const handUp = fanFloating ? !floatTucked : handPinned;
  /** Default spot: the board keeps a strip free under it for the tucked cards. */
  const fanCenter = fanHand && shownFanPos == null;
  /** Desktop / landscape tablet: the board leans back in perspective, seen from your seat. */
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  const tilted = wide && !lp && tiltFits && prefs.tiltedBoard;
  // Landscape phones keep the hand in the right column (a scrolling grid), never over the field.
  const railHand = usesRailHand(wide, lp, railHandTall, fanHand);
  /** Portrait phones: the hand strip overlaps its cards in a fan instead of scrolling. */
  const phoneFan = usesPhoneFan(
    wide,
    specFans ? "fan" : handLayout,
    specFans && view?.revealedHands
      ? (view.revealedHands[seat ?? view.seat]?.length ?? 0)
      : (view?.you.hand.length ?? 0),
  );
  /** Desktop: which column each side panel sits in (dragged by its grip, saved in settings). */
  const panelLayout = useMemo(() => parsePanelLayout(prefs.panelLayout), [prefs.panelLayout]);
  const arenaBodyRef = useRef<HTMLDivElement | null>(null);
  const panelDrag = usePanelDrag(
    arenaBodyRef,
    panelLayout,
    (next) => updateSettings({ panelLayout: serializePanelLayout(next) }),
    {
      id: "oppHand",
      spot: prefs.oppHandSpot || null,
      onChange: (spot) => updateSettings({ oppHandSpot: spot ?? "" }),
    },
  );
  const panelSizes = useMemo(() => parsePanelSizes(prefs.panelSizes), [prefs.panelSizes]);
  const panelResize = usePanelResize(
    arenaBodyRef,
    panelSizes,
    (next) => updateSettings({ panelSizes: serializePanelSizes(next) }),
  );
  const [lpPanel, setLpPanel] = useState<LandscapePanel | null>(null);
  // Starting a drag (or leaving landscape) must never leave an overlay over the board.
  useEffect(() => {
    if (dragPayload || !lp) setLpPanel(null);
  }, [dragPayload, lp]);
  const [handSorted, setHandSorted] = useState(prefs.sortHandByCost);
  /** Your own hand order (instance ids) from dragging cards around while unsorted. */
  const [handOrderIds, setHandOrderIds] = useState<readonly string[]>([]);
  /** The hand's display order right now, for a reorder dropped mid-render. */
  const handShownIdsRef = useRef<readonly string[]>([]);
  const captureHandShuffle = useHandShuffle(handShownIdsRef, { sound: prefs.turnSound });
  const onHandReorder = useCallback(
    (cardId: string, slot: number, x: number, y: number) => {
      captureHandShuffle("drop", { cardId, x, y });
      setHandOrderIds(moveToSlot(handShownIdsRef.current, cardId, slot));
    },
    [captureHandShuffle],
  );
  // A floating fan steps aside once a dragged card leaves it (board drops under it).
  const handReorder = useHandReorder(onHandReorder, { oneWayOut: fanFloating });
  /** Hand card (instance id) being dragged: it lifts out of the hand and follows the pointer. */
  const [liftedHandId, setLiftedHandId] = useState<string | null>(null);
  useHandLift(liftedHandId);
  function toggleHandSort() {
    captureHandShuffle("sort");
    setHandSorted((v) => !v);
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const fullscreenOffered = useMemo(() => canOfferFullscreen(readInstallEnv()), []);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement != null,
  );
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    const request =
      document.fullscreenElement != null
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
    // Denied (no user gesture, policy): stay windowed.
    request.catch(() => {});
  }
  const [selectedDonIds, setSelectedDonIds] = useState<Set<string>>(new Set());
  /** Click-to-attach: DON!! selected + target tapped, awaiting confirm. */
  const [pendingAttach, setPendingAttach] = useState<PendingAttach | null>(null);
  /** Hand card (instance id) waiting on "which Character do you replace?". */
  const [replaceCardId, setReplaceCardId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const handRowRef = useRef<HTMLDivElement | null>(null);
  const playmatUrl = usePlaymatUrl();
  const cardBackUrl = useCardBackUrl();
  const playmatDim = prefs.playmatDim;
  const playmatOpacity = prefs.playmatOpacity;

  // Changing a setting mid-match applies it straight away.
  useEffect(() => {
    setHandPinned(prefs.keepHandOpen);
    setHandHidden(false);
  }, [prefs.keepHandOpen]);
  useEffect(() => setHandSorted(prefs.sortHandByCost), [prefs.sortHandByCost]);

  useEffect(() => {
    if (!timer?.turnEndsAt && !timer?.matchEndsAt && !timer?.clockEndsAt && !opponentAwayUntil) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer?.turnEndsAt, timer?.matchEndsAt, timer?.clockEndsAt, opponentAwayUntil]);

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

  // Desktop: the big preview follows the opponent's latest play, so one you
  // looked away from is still readable. Hovering a card wins for a moment.
  const previewOppSeat: 0 | 1 = (seat ?? view?.seat ?? 0) === 0 ? 1 : 0;
  const oppPlay = wide && !lp ? latestOpponentPlay(battleLog, previewOppSeat) : null;
  const oppPlayId = oppPlay?.entryId ?? null;
  const seenOppPlayId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = seenOppPlayId.current;
    seenOppPlayId.current = oppPlayId;
    if (!oppPlay || oppPlayId === prev) return;
    const auto = {
      defId: oppPlay.defId,
      ownerSeat: previewOppSeat,
      caption: opponentPlayCaption(oppPlay),
    };
    if (prev === undefined) {
      // First mount: only fill an empty panel.
      if (!getPreviewCard()) setAutoPreviewCard(auto);
      return;
    }
    // A log replaced wholesale (resync / undo) is not a new play.
    if (prev !== null && !battleLog.some((e) => e.id === prev)) return;
    if (shouldAutoPreview(Date.now(), getLastHoverAt())) setAutoPreviewCard(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppPlayId]);

  const over = matchOver != null || view?.winner != null;
  // The strip shows the short question; the full server text stays in the tooltip.
  const midlineText = view
    ? view.pendingChoices?.length
      ? promptShortLine(view.pendingChoices[0])
      : view.battle
        ? describeBattle(view, (defId) => lookupCard(defId).name, !(spectator || view.spectator))
        : null
    : null;
  // On phones every pending prompt already shows its sentence (sheet, field bar or floating
  // card), so the midline would repeat it. It still blocks other hints from using the strip.
  const midlineShown = !wide && view?.pendingChoices?.length ? null : midlineText;
  const midlineTitle = view?.pendingChoices?.length ? view.pendingChoices[0].prompt : midlineShown;
  // Screen stays on through the opponent's long turns; released when the match ends.
  useScreenWakeLock(!over);
  /** "View board" on the match-over card: the card steps aside so the final board shows. */
  const [resultHidden, setResultHidden] = useState(false);
  useEffect(() => {
    if (!over) setResultHidden(false);
  }, [over]);
  const mySeat = seat ?? view?.seat ?? null;
  const spectating = spectator || Boolean(view?.spectator);
  const result = describeMatchResult({
    winner: matchOver?.winner ?? view?.winner,
    // The room's reason (concede / clock) beats the engine's view.winReason.
    reason: matchOver?.reason ?? view?.winReason,
    youSeat: spectating ? null : mySeat,
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
  // Track the card, not its hand slot: indexes shift as the hand changes.
  const replaceHandIndex = replaceCardId
    ? (view?.you.hand.findIndex((c) => c.id === replaceCardId) ?? -1)
    : -1;
  const replaceOpen = replaceHandIndex >= 0 && playNeedsReplace(intents, replaceHandIndex);
  useEffect(() => {
    // Drop the prompt once the play stops being legal (turn passed, card left hand…).
    if (replaceCardId && !replaceOpen) setReplaceCardId(null);
  }, [replaceCardId, replaceOpen]);

  function openReplace(handIndex: number) {
    const card = view?.you.hand[handIndex];
    if (!card) return;
    setHandFilter(null);
    setSelectedBoardId(null);
    setReplaceCardId(card.id);
  }

  // Response stops: pass for you when the setting says there is nothing to decide.
  const stopMode = prefs.responseStops;
  const counterOutlook =
    stopMode === "smart" && view && intents.some((i) => i.type === "pass_counter")
      ? (() => {
          const d = deriveDefend(view, intents, { counterIds: [], blockerId: null });
          return d ? { gap: d.gap, values: d.counters.map((c) => c.value) } : undefined;
        })()
      : undefined;
  /**
   * A Counter dropped (or tapped) in the block step: the block is passed, and
   * this card is played (`send`) or staged (`stage`) once the counter step is up.
   */
  const [queuedCounter, setQueuedCounter] = useState<{
    cardId: string;
    mode: "send" | "stage";
  } | null>(null);
  const autoPass =
    stopMode !== "always" &&
    view &&
    !spectating &&
    !over &&
    !view.pendingChoices?.length &&
    queuedCounter == null
      ? responseStopPass(stopMode, intents, counterOutlook)
      : null;
  const autoPassKey =
    autoPass && view
      ? `${view.turnNumber}:${autoPass.type}:${JSON.stringify(view.battle ?? null)}`
      : null;
  const autoPassRef = useRef<{ intent: typeof autoPass; send: typeof onSendIntent }>({
    intent: null,
    send: onSendIntent,
  });
  autoPassRef.current = { intent: autoPass, send: onSendIntent };
  const autoPassSent = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPassKey || autoPassSent.current === autoPassKey) return;
    // Short beat so the attack registers before the step moves on.
    const id = window.setTimeout(() => {
      const { intent, send } = autoPassRef.current;
      if (!intent) return;
      autoPassSent.current = autoPassKey;
      send(intent);
    }, 450);
    return () => window.clearTimeout(id);
  }, [autoPassKey]);

  // Defend tray: while you answer an attack, the block / counter choices live
  // in one tray (portrait: in place of the hand, landscape phone: right column).
  const [stagedCounterIds, setStagedCounterIds] = useState<string[]>([]);
  const [stagedBlockerId, setStagedBlockerId] = useState<string | null>(null);
  const defend =
    view && !spectating && !over && !view.pendingChoices?.length && autoPass == null
      ? deriveDefend(view, intents, { counterIds: stagedCounterIds, blockerId: stagedBlockerId })
      : null;
  const trayHere = defend != null && (!wide || lp);
  // Desktop: the same tray sits in the right rail (one tap plays a counter or
  // blocks) so each card's value and what you still need are in view; the
  // dock keeps the Pass block / Pass counter / Resolve button.
  const railDefend = defend != null && wide && !lp;
  const defendKey =
    trayHere && view ? `${view.turnNumber}:${defend.phase}:${JSON.stringify(view.battle ?? null)}` : null;
  useEffect(() => {
    // A new attack / step (or the tray closing) starts from a clean slate.
    setStagedCounterIds([]);
    setStagedBlockerId(null);
  }, [defendKey]);
  // After the step reset above: the block has passed, so play or stage the
  // queued Counter if the counter step takes it.
  useEffect(() => {
    if (!queuedCounter || !view) return;
    const { settled, intent } = followUpCounter(intents, view.you.hand, queuedCounter.cardId);
    if (!settled) return;
    setQueuedCounter(null);
    if (!intent) return;
    if (queuedCounter.mode === "send") onSendIntent(intent);
    else setStagedCounterIds([queuedCounter.cardId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCounter, intents, view]);

  /** Block step: skip the block, then play (or stage) this Counter in the counter step. */
  function skipBlockToCounter(cardId: string, mode: "send" | "stage") {
    const pass = intents.find((i) => i.type === "pass_block");
    if (!pass) return;
    setStagedBlockerId(null);
    setQueuedCounter({ cardId, mode });
    onSendIntent(pass);
  }

  // Hotseat hands the device over itself; alerts only matter online.
  const alertsOn = !spectating && !over && !hotseatPass && autoPass == null;
  // An attack against you has its own cue, so the generic "your move" alert
  // stays quiet while you are answering one.
  const attackKey = alertsOn ? incomingAttackKey(view, spectating) : null;
  useTurnAlert(alertsOn && intents.length > 0 && attackKey == null, {
    buzz: prefs.turnAlert,
    sound: prefs.turnSound,
  });
  useIncomingAttackCue(attackKey, { sound: prefs.turnSound });
  // Same master Sounds toggle: a tick per opponent card use, a thud per Life lost.
  const reveals = useOpponentReveals(battleLog, previewOppSeat, !spectating && !over);
  const spotlights = useCardSpotlights(battleLog, prefs.cardSpotlight && !over);
  useSoundCues(view, battleLog, previewOppSeat, {
    enabled: alertsOn,
    sound: prefs.turnSound,
    spectating,
  });
  useGameSfx(view, battleLog, { sound: prefs.turnSound, muted: Boolean(hotseatPass) || autoPass != null, spectating });

  // iOS only plays sound after one started inside a gesture: unlock on the
  // first touch of the match so a later cue is allowed to play.
  useEffect(() => {
    if (!prefs.turnSound) return;
    const unlock = () => {
      unlockAudio();
      if (audioUnlocked()) document.removeEventListener("pointerdown", unlock, true);
    };
    document.addEventListener("pointerdown", unlock, true);
    return () => document.removeEventListener("pointerdown", unlock, true);
  }, [prefs.turnSound]);

  // Screen orientation setting: lock where the browser allows it, and again
  // once full screen is entered (Android only allows a lock there).
  const orientationPref = prefs.screenOrientation;
  useEffect(() => {
    void syncOrientationLock(orientationPref);
  }, [orientationPref, isFullscreen]);
  useEffect(() => releaseOrientationLock, []);

  // One-time "rotate for bigger cards" toast on a portrait phone.
  const portraitViewport = useMediaQuery("(orientation: portrait)");
  const phoneViewport = useMediaQuery("(pointer: coarse) and (max-width: 599px)");
  const [rotateHintOpen, setRotateHintOpen] = useState(false);
  const rotateHintDue =
    view != null &&
    !over &&
    // Wait out an attack: the toast would sit over your field mid-response.
    defend == null &&
    // The hint lives in the midline strip, so wait for it to be free.
    midlineText == null &&
    shouldShowRotateHint({
      portrait: portraitViewport,
      phone: phoneViewport,
      setting: orientationPref,
      seen: rotateHintSeen(),
      hotseat: Boolean(hotseatPass),
    });
  useEffect(() => {
    if (rotateHintDue) {
      markRotateHintSeen();
      setRotateHintOpen(true);
    }
  }, [rotateHintDue]);
  // Turning the phone (or picking portrait) puts the hint away.
  const rotateHintShown =
    rotateHintOpen &&
    portraitViewport &&
    orientationPref !== "portrait" &&
    defend == null &&
    midlineText == null;
  const closeRotateHint = useCallback(() => setRotateHintOpen(false), []);

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
  const costArea = view?.you.costArea ?? [];

  const draggableDonIds = useMemo(() => {
    if (!dndEnabled) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const t of costArea) {
      if (canDragDon(intents, t.id)) ids.add(t.id);
    }
    return ids;
  }, [dndEnabled, intents, costArea]);

  const giveDonHighlightIds = useMemo(() => {
    // Intersection across every dragged / selected donId so a drop or tap
    // always fully succeeds.
    if (dragPayload?.type === "give_don") {
      return new Set(giveDonTargetIdsForAll(intents, dragPayload.donIds));
    }
    if (!dragPayload && selectedDonIds.size > 0) {
      return new Set(attachTargetIds(intents, selectedDonIds));
    }
    return EMPTY_IDS;
  }, [dragPayload, intents, selectedDonIds]);

  // Drop stale selections (don rested/used, turn ended, etc.) whenever the
  // legal set changes, so the highlight/selection UI never lies.
  useEffect(() => {
    setSelectedDonIds((prev) => pruneDonSelection(prev, draggableDonIds));
  }, [draggableDonIds]);

  // A pending confirm is only valid while its whole selection still is.
  useEffect(() => {
    if (!pendingAttach) return;
    const stillLegal =
      pendingAttach.donIds.every((id) => selectedDonIds.has(id)) &&
      beginAttach(intents, selectedDonIds, pendingAttach.targetId) != null;
    if (!stillLegal) setPendingAttach(null);
  }, [pendingAttach, selectedDonIds, intents]);

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
      setHandFilter(null);
      // Only with the pointer on the hand (H works from anywhere): away from
      // it, the next hover raises the hand again.
      setTuckUnderPointer(document.querySelector(".hand-fan:hover, .hand-dock:hover") != null);
    }
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

  function clearDonSelection() {
    setSelectedDonIds(new Set());
    setPendingAttach(null);
  }

  function confirmAttach(pending: PendingAttach | null = pendingAttach) {
    const toSend = resolveAttachIntents(intents, pending);
    clearDonSelection();
    if (toSend.length === 0) return;
    setHandFilter(null);
    setSelectedBoardId(null);
    // Sequential client-side intents (no batch protocol).
    for (const intent of toSend) onSendIntent(intent);
  }

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
  });

  const donSelectActive = selectedDonIds.size > 0 || pendingAttach != null;

  // Click-away cancels the DON!! selection / confirm. Taps on the cost area,
  // the confirm itself, or a highlighted attach target are handled by their
  // own click handlers.
  useEffect(() => {
    if (!donSelectActive) return;
    function onPointerDown(e: PointerEvent) {
      const el = e.target instanceof Element ? e.target : null;
      if (
        el?.closest(
          ".don-strip-you, .don-attach-confirm, [data-dnd-drop^='give_don:'], .card-inspect-backdrop",
        )
      ) {
        return;
      }
      clearDonSelection();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [donSelectActive]);

  /** Legal DON!! ids in cost-area display order (active first). */
  const legalDonOrder = useMemo(
    () => costArea.filter((t) => draggableDonIds.has(t.id)).map((t) => t.id),
    [costArea, draggableDonIds],
  );

  function toggleDonSelect(donId: string) {
    setPendingAttach(null);
    setSelectedDonIds((prev) => nextDonSelection(prev, donId, legalDonOrder));
  }

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

  const handDisplayIndices = useMemo(() => {
    if (!view || spectating) return null;
    const hand = view.you.hand;
    if (handSorted) return sortHandIndices(hand, (defId) => lookupCard(defId).cost);
    const at = new Map(hand.map((c, i) => [c.id, i]));
    return reconcileHandOrder(
      handOrderIds,
      hand.map((c) => c.id),
    ).map((id) => at.get(id)!);
  }, [view, spectating, handSorted, handOrderIds]);
  handShownIdsRef.current = (handDisplayIndices ?? []).map((i) => view?.you.hand[i]?.id ?? "");
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

  // Targets for the attacker being dragged, else for the tapped attacker.
  const attackerId = dragPayload?.type === "attack" ? dragPayload.attackerId : selectedBoardId;
  const attackTargetIds = useMemo(() => {
    if (!dndEnabled || !attackerId || !view) return EMPTY_IDS;
    return new Set(attackTargetIdsForAttacker(intents, attackerId, view.opponent.leader.id));
  }, [dndEnabled, attackerId, intents, view]);

  // Quick attach: a selected Leader / Character that can take DON!! gets a
  // +1 / +2 / All row (the other flows, drag and multi-select, are unchanged).
  const quickDonIds =
    dndEnabled &&
    !dragPayload &&
    !donSelectActive &&
    !replaceOpen &&
    selectedBoardId &&
    view &&
    (view.you.leader.id === selectedBoardId ||
      view.you.characters.some((c) => c.id === selectedBoardId))
      ? donIdsForTarget(intents, selectedBoardId)
      : [];
  const quickCounts = quickAttachCounts(quickDonIds.length);

  function quickAttach(count: number) {
    if (!selectedBoardId) return;
    const toSend = donQuickAttach(intents, selectedBoardId, count);
    setHandFilter(null);
    setSelectedBoardId(null);
    // Sequential client-side intents (no batch protocol), like confirmAttach.
    for (const intent of toSend) onSendIntent(intent);
  }

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
      drop?.kind === "play_field" &&
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
    specFans ? { openSpread: SPECTATOR_FAN_SPREAD, capSelector: ".arena .playmat" } : undefined,
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
  const viewingSeat: Seat | undefined = spectating ? undefined : boardSeat;
  // Older servers omit firstSeat; they always started seat 0.
  const firstSeat: Seat = view.firstSeat ?? 0;
  const youFirst = boardSeat === firstSeat;
  const orderLabel = spectating
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
    pinned: handUp || specFans != null,
    hidden: handHidden && specFans == null,
    mulligan: decidingMulligan,
    selected: handFilter != null,
    picking: handPick,
  });
  const handOpen = drawer === "open";
  const drawerClass =
    drawer === "open" ? " is-open" : drawer === "hidden" ? " is-hidden" : tuckUnderPointer ? " is-tucking" : "";

  const splash: SplashMessage | null = over || !prefs.turnSplash
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

  const undoState = undo?.state ?? null;
  const undoPendingMine =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from === boardSeat;
  const undoPendingTheirs =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from !== boardSeat;

  /** Card showing where a hand card dragged over the hand would land, if it moves. */
  function reorderMarker(ids: readonly string[]): { id: string; cls: string } | null {
    const r = handReorder.reorder;
    if (!r || r.slot == null) return null;
    const others = ids.filter((id) => id !== r.cardId);
    if (others.length === 0 || ids.indexOf(r.cardId) === r.slot) return null;
    return r.slot < others.length
      ? { id: others[r.slot]!, cls: "hand-drop-before" }
      : { id: others[others.length - 1]!, cls: "hand-drop-after" };
  }

  /** `fanned`: each card gets its tilt and arc drop (see handFan.ts). */
  function renderHandCards(fanned = false) {
    const pose = (i: number, n: number): CSSProperties | undefined => {
      if (!fanned) return undefined;
      const p = fanPose(i, n);
      return { "--rot": `${p.rot.toFixed(2)}deg`, "--drop": p.drop.toFixed(4) } as CSSProperties;
    };
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
          showCounter={prefs.handCounters}
          selected={handFilter === idx}
          onClick={() => selectHandCard(idx)}
          instantClick
          dragEnabled={boardDrag || reorderable}
          dragPayload={payload}
          onDragStart={() => {
            setLiftedHandId(c.id);
            if (reorderable) handReorder.begin(c.id);
            if (boardDrag) setDragPayload(payload);
          }}
          onDragEnd={(x, y) => {
            setLiftedHandId(null);
            // Dropped back on the hand: a new spot in the hand, never a play.
            if (reorderable && handReorder.end(x, y)) setDragPayload(null);
            else if (boardDrag) commitDrop(payload, x, y);
          }}
          onDragCancel={() => {
            setLiftedHandId(null);
            handReorder.cancel();
            setDragPayload(null);
          }}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
          classNameExtra={[unaffordable ? "hand-unaffordable" : "", marker?.id === c.id ? marker.cls : "", liftedHandId === c.id ? "card-lifted" : ""].filter(Boolean).join(" ") || undefined}
          style={pose(pos, order.length)}
        />
      );
    });
  }

  function confirmCounters() {
    if (!defend) return;
    const toSend = resolveStagedCounters(intents, you.hand, defend.stagedIds);
    setStagedCounterIds([]);
    // Sequential client-side intents, highest hand slot first (see resolveStagedCounters).
    for (const intent of toSend) onSendIntent(intent);
  }

  function declareStagedBlocker() {
    const id = defend?.stagedBlockerId;
    const intent = intents.find((i) => i.type === "declare_block" && i.blockerId === id);
    setStagedBlockerId(null);
    if (intent) onSendIntent(intent);
  }

  const defendPrimary =
    trayHere && defend
      ? defend.phase === "block"
        ? defend.stagedBlockerId
          ? {
              label: `Block with ${defend.blockers.find((b) => b.id === defend.stagedBlockerId)?.name ?? "blocker"}`,
              onPress: declareStagedBlocker,
            }
          : { label: "No block" }
        : defend.stagedIds.length > 0
          ? {
              label: counterPrimaryLabel(defend, true),
              onPress: confirmCounters,
              warn: counterPrimaryLabel(defend, true) !== "Confirm counter",
            }
          : { label: counterPrimaryLabel(defend, true) }
      : undefined;
  const counterLabel =
    !trayHere && defend?.phase === "counter" ? counterPrimaryLabel(defend, false) : undefined;

  const defendTray =
    (trayHere || railDefend) && defend ? (
      <DefendTray
        model={defend}
        layout={railDefend ? "rail" : "tray"}
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
    onPress: () => {
      if (isReplacePlay(intent)) {
        openReplace(intent.handIndex as number);
        return;
      }
      setHandFilter(null);
      setSelectedBoardId(null);
      onSendIntent(intent);
    },
  }));

  // Desktop: the primary action (and any other phase-wide one: Keep / Mulligan,
  // Resolve trigger) floats at the board's midline; there is no Actions panel.
  // Phones keep the bottom IntentBar.
  const docked = wide && !lp && !spectating && !over;
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
      ? needsDonHint(selectedHandCard.playCost ?? lookupCard(selectedHandCard.defId).cost, you.activeDonCount) ?? undefined
      : undefined;
  // Desktop has no Actions panel: only the defend tray stays in the rail.
  const intentPanel = railDefend && defendTray ? (
    defendTray
  ) : wide && !lp ? null : !spectating ? (
    <IntentBar
      waiting={oppWait}
      idle={oppWait ? "opponent" : view.pendingChoices?.[0]?.seat === mySeat ? "prompt" : null}
      intents={barIntents}
      view={view}
      disabled={over}
      filterHandIndex={handFilter}
      selectedBoardId={selectedBoardId}
      confirmEndTurn={endTurnWarning(prefs.endTurnConfirm, view.legalIntents)}
      onSend={sendPrimary}
      onChooseReplace={openReplace}
      defend={defendPrimary}
      counterLabel={counterLabel}
      onCard={{ count: cardIntents.length, active: popoverOpen }}
      emptyHint={affordHint}
    />
  ) : (
    <div className="intent-bar">
      <p className="intent-empty">
        {nearHand ? "Spectating — both hands shown; intents disabled" : "Spectating — both hands hidden; intents disabled"}
      </p>
    </div>
  );

  const chatPanel = chat ? (
    <ChatPanel
      lines={chat.lines}
      mySeat={spectating ? null : boardSeat}
      onSend={chat.onSend}
      defaultOpen={wide}
    />
  ) : null;
  const skins = sideSkins({
    own: { playmat: playmatUrl, cardBack: cardBackUrl },
    seatSkins,
    nearSeat: boardSeat,
    farSeat: oppSeat,
    hotseat: Boolean(hotseatPass),
    spectating,
  });
  const oppMatUrl = skins.far.playmat;
  const oppCardBackUrl = skins.far.cardBack;

  /** Desktop side panels, by id; null when a panel has nothing to show right now. */
  const sidePanels: Record<PanelId, React.ReactNode> = {
    preview: <CardPreviewPanel />,
    recent: <RecentPlaysStrip entries={battleLog} youSeat={previewOppSeat === 0 ? 1 : 0} />,
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
        cards={farHand}
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
      <section className="rail-hand rail-hand-fan" aria-label={`${seatLabel(players, boardSeat)} hand: ${handCount} cards`}>
        <div className="rail-hand-head">
          <span className="rail-hand-title">{seatLabel(players, boardSeat)} hand</span>
          <span className="hand-rail-count">{handCount}</span>
        </div>
        <div className="hand-row hand-row-fan" ref={handRowRef}>
          <div className="hand-row-inner hand-fan-cards" style={{ "--n": Math.max(handCount, 1) } as CSSProperties}>
            {renderHandCards(true)}
          </div>
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
  };
  /** Panels with something to show, top to bottom, in each column (the rest keep their places). */
  const shownPanels: Record<PanelColumn, PanelId[]> = {
    left: panelLayout.left.filter((id) => sidePanels[id] != null),
    right: panelLayout.right.filter((id) => sidePanels[id] != null),
  };
  function renderColumnPanels(column: PanelColumn) {
    const ids = shownPanels[column];
    const sized = ids.some((id) => panelResize.shown.heights[id] != null);
    const panels = ids.map((id, i) =>
      renderSidePanel(id, i > 0 ? ids[i - 1]! : null, i === ids.length - 1, sized),
    );
    // Answering an attack: the defend tray rides under Turn and clocks (not movable).
    if (column === "right" && railDefend && defendTray) {
      const at = ids.indexOf("turn") + 1;
      panels.splice(
        at,
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


  const hudUndoPass = (
    <>
    {undo && undoState?.enabled && !spectating && !over ? (
      undoPendingMine ? (
        <button
          type="button"
          className="hud-undo-btn hud-icon-btn armed"
          aria-label="Cancel undo request"
          title="Waiting for your opponent to accept. Press to cancel."
          onClick={() => undo.onAction("cancel")}
        >
          ↺ Cancel
        </button>
      ) : undoPendingTheirs || (compactHud && undoState.targetTurn == null) ? null : (
        <ConfirmButton
          className="hud-undo-btn hud-icon-btn"
          label="↺"
          confirmLabel="Undo?"
          reserveWidth
          ariaLabel="Undo"
          title={
            undoState.targetTurn == null
              ? "Nothing to undo yet"
              : `Rewind to the start of turn ${undoState.targetTurn}${
                  undo.autoAccept ? "" : " (your opponent must accept)"
                }`
          }
          disabled={undoState.targetTurn == null}
          onConfirm={() => undo.onAction("request")}
        />
      )
    ) : null}
    {hotseatPass ? (
      // The phone bar is tight: "→ P2" here, the full wording in its name.
      <button
        type="button"
        className="hud-pass-btn"
        title={`Hand the device to ${playerLabel(hotseatPass.otherSeat)}`}
        aria-label={`Switch to ${playerLabel(hotseatPass.otherSeat)}`}
        onClick={hotseatPass.onPass}
      >
        → P{hotseatPass.otherSeat + 1}
      </button>
    ) : null}
    </>
  );
  const matchMenuEl = (placement: "top" | "left") => (
    <MatchMenu
      placement={placement}
      items={matchMenuItems({
        spectating,
        over,
        hotseat: Boolean(hotseatPass),
        fullscreenOffered,
        canConcede: Boolean(onConcede),
      })}
      info={{
        matchup: players
          ? `${spectating ? seatLabel(players, 0) : seatName(players, boardSeat) ?? "You"} vs ${seatLabel(
              players,
              spectating ? 1 : oppSeat,
            )}`
          : null,
        seat: spectating ? "Spectating" : null,
        order: orderLabel,
      }}
      roomId={matchId}
      isFullscreen={isFullscreen}
      leaveLabel={leaveLabel}
      onSettings={() => setSettingsOpen(true)}
      onToggleFullscreen={toggleFullscreen}
      onConcede={() => onConcede?.()}
      onLeave={onLeave}
    />
  );

  return (
    <MatchViewerSeatContext.Provider value={spectating ? null : boardSeat}>
    <PromptSlotContext.Provider value={promptSlotValue}>
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${oppActive ? " opp-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }${wide ? " arena-wide" : ""}${lp ? " arena-lp" : ""}${docked ? " arena-docked" : ""}${fanCenter ? " arena-fan-center" : ""}${
        specFans === "landscape" ? " arena-spec-lp" : specFans ? " arena-spec-top" : ""
      }${
        tilted ? " arena-tilt" : ""
      }${prefs.donUpright ? " don-upright" : ""}`}
      // Read by the e2e click-through tests (duel-web/e2e) to follow the game.
      data-phase={view.phase}
      data-turn={view.turnNumber}
      data-seat={boardSeat}
      style={wide && !lp ? panelResize.arenaStyle : undefined}
    >
      {lp ? null : compactHud ? (
        <header className="hud-bar hud-compact">
          <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
            {mulliganPhase && decidingMulligan ? null : (
              <>
                <span className="hud-phase">{phaseLabel(view.phase)}</span>
                <span className="hud-sep">·</span>
              </>
            )}
            <span className="hud-turn-num">T{view.turnNumber}</span>
            {mulliganPhase && decidingMulligan ? (
              <span className="hud-turn-chip">MULLIGAN</span>
            ) : yourTurn ? (
              <span className="hud-turn-chip hud-turn-mine">YOUR TURN</span>
            ) : oppActive && !spectating ? (
              <span className="hud-turn-chip hud-turn-theirs">OPPONENT&apos;S TURN</span>
            ) : null}
            {spectating ? <span className="hud-turn-chip">SPECTATOR</span> : null}
            {formatCountdown(timer?.turnEndsAt, now) ? (
              <span className="hud-turn-chip hud-timer" title="Turn clock">
                {formatCountdown(timer?.turnEndsAt, now)}
              </span>
            ) : null}
            {formatCountdown(timer?.matchEndsAt, now) ? (
              <span className="hud-turn-chip hud-timer" title="Match clock">
                Match {formatCountdown(timer?.matchEndsAt, now)}
              </span>
            ) : null}
            {seatClocks ? (
              <span
                className="hud-turn-chip hud-timer hud-clock-pair"
                title={`${spectating ? playerLabel(boardSeat) : "Your"} time ${seatClocks.you} · ${
                  spectating ? playerLabel(oppSeat) : "Opponent's"
                } time ${seatClocks.opp}`}
              >
                <span
                  className={`hud-seat-clock${seatClocks.running === "you" ? " running" : ""}${
                    seatClocks.youLow ? " low" : ""
                  }`}
                >
                  {seatClocks.you}
                </span>
                <span className="hud-sep">/</span>
                <span
                  className={`hud-seat-clock${seatClocks.running === "opp" ? " running" : ""}${
                    seatClocks.oppLow ? " low" : ""
                  }`}
                >
                  {seatClocks.opp}
                </span>
              </span>
            ) : null}
          </div>
          <div className="hud-actions">
            {hudUndoPass}
            {matchMenuEl("top")}
          </div>
        </header>
      ) : (
        <header className="hud-bar">
          <div className="hud-brand">OPTCG DUEL</div>
          <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
            <span className="hud-phase">{phaseLabel(view.phase)}</span>
            <span className="hud-sep">·</span>
            <span>Turn {view.turnNumber}</span>
            <span className="hud-sep">·</span>
            {players ? (
              <span
                className="hud-names"
                title={`${seatLabel(players, spectating ? 0 : boardSeat)} vs ${seatLabel(
                  players,
                  spectating ? 1 : oppSeat,
                )}`}
              >
                <strong className="hud-name hud-name-you">
                  {spectating ? seatLabel(players, 0) : seatName(players, boardSeat) ?? "You"}
                </strong>
                <span className="hud-sep">vs</span>
                <span className="hud-name">
                  {seatLabel(players, spectating ? 1 : oppSeat)}
                </span>
              </span>
            ) : spectating ? (
              <span>Spectating</span>
            ) : null}
            <span className={`hud-turn-chip hud-order${youFirst ? " first" : ""}`}>
              {orderLabel}
            </span>
            {mulliganPhase && decidingMulligan ? (
              <span className="hud-turn-chip">MULLIGAN</span>
            ) : yourTurn ? (
              <span className="hud-turn-chip hud-turn-mine">YOUR TURN</span>
            ) : oppActive && !spectating ? (
              <span className="hud-turn-chip hud-turn-theirs">OPPONENT&apos;S TURN</span>
            ) : null}
            {spectating ? <span className="hud-turn-chip">SPECTATOR</span> : null}
            {formatCountdown(timer?.turnEndsAt, now) ? (
              <span className="hud-turn-chip hud-timer" title="Turn clock">
                Turn {formatCountdown(timer?.turnEndsAt, now)}
              </span>
            ) : null}
            {formatCountdown(timer?.matchEndsAt, now) ? (
              <span className="hud-turn-chip hud-timer" title="Match clock">
                Match {formatCountdown(timer?.matchEndsAt, now)}
              </span>
            ) : null}
            {seatClocks ? (
              <>
                <span
                  className={`hud-turn-chip hud-timer hud-seat-clock${
                    seatClocks.running === "you" ? " running" : ""
                  }${seatClocks.youLow ? " low" : ""}`}
                  title="Your time"
                >
                  {spectating ? seatLabel(players, boardSeat) : "You"} {seatClocks.you}
                </span>
                <span
                  className={`hud-turn-chip hud-timer hud-seat-clock${
                    seatClocks.running === "opp" ? " running" : ""
                  }${seatClocks.oppLow ? " low" : ""}`}
                  title="Opponent's time"
                >
                  {spectating ? seatLabel(players, oppSeat) : "Opp"} {seatClocks.opp}
                </span>
              </>
            ) : null}
          </div>
          <div className="hud-actions">
            {hotseatPass ? null : <RoomChip roomId={matchId} />}
            {undo && undoState?.enabled && !spectating && !over ? (
              undoPendingMine ? (
                <button
                  type="button"
                  className="hud-undo-btn armed"
                  title="Waiting for your opponent to accept — click to cancel"
                  onClick={() => undo.onAction("cancel")}
                >
                  Undo asked · Cancel
                </button>
              ) : undoPendingTheirs ? null : (
                <ConfirmButton
                  className="hud-undo-btn"
                  label="↺ Undo"
                  confirmLabel={
                    undoState.targetTurn != null ? `Undo to turn ${undoState.targetTurn}?` : "Undo?"
                  }
                  title={
                    undoState.targetTurn == null
                      ? "Nothing to undo yet"
                      : `Rewind to the start of turn ${undoState.targetTurn}${
                          undo.autoAccept ? "" : " (your opponent must accept)"
                        }`
                  }
                  disabled={undoState.targetTurn == null}
                  onConfirm={() => undo.onAction("request")}
                />
              )
            ) : null}
            {hotseatPass ? (
              <button
                type="button"
                className="hud-pass-btn"
                title={`Hand the device to ${playerLabel(hotseatPass.otherSeat)}`}
                onClick={hotseatPass.onPass}
              >
                Switch to {playerLabel(hotseatPass.otherSeat)}
              </button>
            ) : null}
            {onConcede && !spectating && !over ? (
              <ConfirmButton
                className="hud-concede-btn"
                label="Concede"
                confirmLabel="Confirm concede"
                title="Forfeit this match"
                onConfirm={onConcede}
              />
            ) : null}
            {fullscreenOffered ? (
              <button
                type="button"
                className="hud-undo-btn hud-settings-btn"
                aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                aria-pressed={isFullscreen}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? "⤡" : "⛶"}
              </button>
            ) : null}
            <button
              type="button"
              className="hud-undo-btn hud-settings-btn"
              aria-label="Gameplay settings"
              title="Gameplay settings"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </button>
            <button type="button" className="leave-btn" onClick={onLeave}>
              {leaveLabel}
            </button>
          </div>
        </header>
      )}

      {settingsOpen ? <GameplaySettingsSheet onClose={() => setSettingsOpen(false)} /> : null}

      {helpOpen ? <HotkeyHelpSheet onClose={() => setHelpOpen(false)} /> : null}

      {undoPendingTheirs && undoState?.pending ? (
        <div className="undo-request" role="alertdialog" aria-label="Undo request">
          <p>
            <strong>{seatName(players, undoState.pending.from) ?? "Your opponent"}</strong> wants to
            undo back to the start of <strong>turn {undoState.pending.toTurn}</strong>.
          </p>
          <div className="undo-request-actions">
            <button type="button" className="btn btn-primary" onClick={() => undo?.onAction("accept")}>
              Allow
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => undo?.onAction("decline")}>
              Decline
            </button>
          </div>
        </div>
      ) : null}

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

      {mulliganPhase && !spectating ? (
        <div
          className={`mulligan-banner${view.you.mulliganDone ? "" : " mulligan-banner-explainer"}`}
          role="status"
        >
          {view.you.mulliganDone ? (
            <>
              <strong>Mulligan locked in.</strong> Waiting for the other seat
              {view.opponent.mulliganDone ? "" : " — pass the device if this is hotseat"}.
            </>
          ) : (
            <>
              <strong>{youFirst ? "You go first." : "You go second."}</strong>{" "}
              {youFirst
                ? "No draw and 1 DON!! on your first turn."
                : "You draw and get 2 DON!! on your first turn."}{" "}
              <strong>Opening hand:</strong> keep these 5 cards, or mulligan to
              shuffle them back and draw a new hand of 5. Life is dealt after both
              players decide.
            </>
          )}
        </div>
      ) : null}

      <div className="arena-body" ref={arenaBodyRef}>
        {panelDrag.overlay}
        {lp ? (
          <LandscapeRail
            open={lpPanel}
            onToggle={(panel) => setLpPanel((cur) => (cur === panel ? null : panel))}
            hasChat={Boolean(chat)}
            logCount={battleLog.length}
            menu={matchMenuEl("left")}
          />
        ) : wide ? (
          <aside className="arena-left board-col" data-panel-col="left" aria-label="Side panels, left">
            {renderColumnPanels("left")}
            {prefs.layoutGrips ? (
              <div className="col-resize col-resize-left" {...panelResize.columnHandleProps("left")} />
            ) : null}
          </aside>
        ) : null}

        <div className="playmat" data-mat-drop={wide && !lp ? "" : undefined}>
          <div className="playmat-inner">
            {farHand && (specFans === "desktop" || specFans === "portrait") ? (
              <SpectatorFarHand
                cards={farHand}
                ownerSeat={oppSeat}
                mode={specFans}
                label={`${seatLabel(players, oppSeat)} hand`}
              />
            ) : oppHandOnMat ? (
              <div className={`opp-hand-mat opp-hand-mat-${oppHandOnMat}`}>
                <SidePanel
                  id="oppHand"
                  dragging={panelDrag.draggingId === "oppHand"}
                  grip={prefs.layoutGrips ? panelDrag.gripProps("oppHand") : null}
                >
                  <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="mat" />
                </SidePanel>
              </div>
            ) : oppHandRight ? (
              <div className="opp-hand-hint opp-hand-hint-right">
                <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" />
              </div>
            ) : (
              <OppHandHint count={opp.handCount} cardBackUrl={oppCardBackUrl} cards={farHand} ownerSeat={oppSeat} />
            )}

            <SideField
              side="opp"
              compact
              countRow={portraitMat}
              turnOrder={firstSeat === oppSeat ? "first" : "second"}
              activeTurn={oppActive}
              matImageUrl={oppMatUrl}
              cardBackUrl={oppCardBackUrl}
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
                faceUpLife: opp.faceUpLife,
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
                <div className="prompt" title={midlineTitle ?? undefined}>
                  <span className="prompt-text">{midlineShown}</span>
                </div>
              ) : rotateHintShown ? (
                <RotateHint onClose={closeRotateHint} />
              ) : (
                <div className="midline-ornament" aria-hidden>
                  <span />
                </div>
              )}
            </div>

            <SideField
              side="you"
              turnOrder={youFirst ? "first" : "second"}
              activeTurn={youActive}
              matImageUrl={skins.near.playmat}
              matDim={playmatDim}
              matOpacity={playmatOpacity}
              cardBackUrl={skins.near.cardBack}
              ownerSeat={boardSeat}
              viewingSeat={viewingSeat}
              data={{
                leader: you.leader,
                characters: you.characters,
                stage: you.stage,
                deckCount: you.deckCount,
                trash: you.trash,
                lifeCount: you.lifeCount,
                faceUpLife: you.faceUpLife,
                donDeckCount: you.donDeckCount,
                costArea: you.costArea,
                activeDonCount: you.activeDonCount,
              }}
              select={
                spectating
                  ? undefined
                  : {
                      selectedId: selectedBoardId,
                      onSelect: selectBoardCard,
                      actionableIds: actionableBoardIds,
                    }
              }
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
        </div>

        {wide && !lp ? (
          <div className="arena-rail board-col" data-panel-col="right">
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
              <div className="lp-actions">{hudUndoPass}</div>
            ) : null}
            {farHand && specFans === "landscape" ? (
              <SpectatorFarHand
                cards={farHand}
                ownerSeat={oppSeat}
                mode="landscape"
                label={`${seatLabel(players, oppSeat)} hand`}
              />
            ) : oppHandRight ? (
              <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" />
            ) : (
              <OppHandFan
                count={opp.handCount}
                cardBackUrl={oppCardBackUrl}
                compact
                cards={farHand}
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
                <div className="hand-rail-head">
                  <span className="hand-rail-title">{spectating ? (nearHand ? "Seat hand" : "Seat hand (hidden)") : "Hand"}</span>
                  <span className="hand-rail-count">{handCount}</span>
                  {!spectating ? (
                    <div className="hand-rail-actions">
                      {sortHandBtn}
                      <button
                        type="button"
                        className="hand-rail-btn"
                        onClick={() => {
                          setHandCollapsed((v) => {
                            const next = !v;
                            if (next) setHandFilter(null);
                            return next;
                          });
                        }}
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
                  <div className="hand-row" ref={handRowRef}>
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

      {lp && lpPanel ? (
        <LandscapeOverlay panel={lpPanel} onClose={() => setLpPanel(null)}>
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

      {fanHand ? (
        <div
          ref={fanRef}
          className={`hand-fan ${
            shownFanPos == null
              ? "hand-fan-center"
              : fanFloating
                ? "hand-fan-free hand-fan-float"
                : "hand-fan-free hand-fan-docked"
          }${fanMove.livePos ? " is-moving" : ""}${drawerClass}${handTucked ? " is-dragging" : ""}`}
          style={
            {
              "--n": Math.max(handCount, 1),
              ...(shownFanPos ? { "--fan-x": shownFanPos.x, "--fan-y": shownFanPos.y } : null),
            } as CSSProperties
          }
          aria-label={`Your hand: ${handCount} cards`}
          onClick={dropHandClickFocus}
          onPointerLeave={() => setTuckUnderPointer(false)}
        >
          <div className="hand-fan-head">
            {specFans ? (
              <span className="hand-fan-toggle hand-fan-label">
                <span className="hand-fan-title">{seatLabel(players, boardSeat)} hand</span>
                <span className="hand-rail-count">{handCount}</span>
              </span>
            ) : null}
            {specFans ? null : prefs.layoutGrips ? (
              <button
                type="button"
                className="hand-fan-grip"
                aria-label="Move your hand (drag, or arrow keys)"
                title="Drag to move your hand anywhere"
                {...fanMove.gripProps}
              >
                <span aria-hidden />
              </button>
            ) : null}
            {specFans ? null : (
              <button
                type="button"
                className="hand-fan-toggle"
                aria-expanded={handOpen}
                title={
                  handHidden
                    ? "Show your hand (H)"
                    : handUp
                      ? prefs.keepHandOpen
                        ? "Let the hand tuck away"
                        : "Let the hand tuck away (H)"
                      : "Keep the hand up (H)"
                }
                onClick={() => {
                  if (handHidden) {
                    setHandHidden(false);
                    setHandPinned(true);
                    return;
                  }
                  toggleHandUp();
                }}
              >
                <span className="hand-fan-title">{spectating ? "Seat hand" : "Hand"}</span>
                <span className="hand-rail-count">{handCount}</span>
                <span className="hand-dock-caret" aria-hidden>
                  {handOpen ? "▾" : "▴"}
                </span>
              </button>
            )}
            {!spectating ? (
              sortHandBtn
            ) : null}
            {specFans ? null : hideHandBtn}
          </div>
          <div className="hand-fan-cards" ref={handRowRef} inert={handHidden || undefined}>
            {renderHandCards(true)}
          </div>
        </div>
      ) : wide && !railHand ? (
        <div
          className={`hand-dock${drawerClass}${handTucked ? " is-dragging" : ""}`}
          style={
            {
              "--n": Math.max(handCount, 1),
              "--n1": Math.max(handCount - 1, 1),
            } as CSSProperties
          }
          aria-label={`Your hand: ${handCount} cards`}
          onClick={dropHandClickFocus}
          onPointerLeave={() => setTuckUnderPointer(false)}
        >
          <div className="hand-dock-head">
            <button
              type="button"
              className="hand-dock-toggle"
              aria-expanded={handOpen}
              title={handHidden ? "Show your hand (H)" : handUp ? "Let the hand tuck away" : "Keep the hand open"}
              onClick={() => {
                if (handHidden) {
                  setHandHidden(false);
                  setHandPinned(true);
                  return;
                }
                toggleHandUp();
              }}
            >
              <span>{spectating ? "Seat hand" : "Hand"}</span>
              <span className="hand-rail-count">{handCount}</span>
              <span className="hand-dock-caret" aria-hidden>
                {handOpen ? "▾" : "▴"}
              </span>
            </button>
            {!spectating ? (
              sortHandBtn
            ) : null}
            {hideHandBtn}
          </div>
          <div className="hand-dock-cards" ref={handRowRef} inert={handHidden || undefined}>
            {renderHandCards()}
          </div>
        </div>
      ) : null}

      {!spectating && mySeat != null && replaceOpen && !view.pendingChoices?.length ? (
        <ReplacePrompt
          key={replaceCardId ?? ""}
          view={view}
          intents={intents}
          handIndex={replaceHandIndex}
          mySeat={mySeat}
          onCancel={() => setReplaceCardId(null)}
          onSend={(intent) => {
            setReplaceCardId(null);
            onSendIntent(intent);
          }}
        />
      ) : handConfirm && mySeat != null && view.pendingChoices?.[0] ? (
        <HandConfirmPrompt
          key={view.pendingChoices[0].id}
          choice={view.pendingChoices[0]}
          anchor={handConfirm}
          mySeat={mySeat}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : floatingPrompts &&
        !spectating &&
        mySeat != null &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat === mySeat &&
        canFloat(view.pendingChoices[0]) ? (
        <FloatingPrompt
          key={view.pendingChoices[0].id}
          choice={view.pendingChoices[0]}
          mySeat={mySeat}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : !spectating &&
      view.pendingChoices?.[0]?.kind === "order_effects" &&
      view.pendingChoices[0].seat === mySeat ? (
        <HideablePrompt
          name="Order effects"
          dodge={promptBattle}
          hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
          onShow={() => setHiddenChoiceId(null)}
        >
          <EffectOrderPrompt
            key={view.pendingChoices[0].id}
            choice={view.pendingChoices[0]}
            onHide={() => setHiddenChoiceId(view.pendingChoices?.[0]?.id ?? null)}
            onSend={(intent) => {
              setHandFilter(null);
              setSelectedBoardId(null);
              onSendIntent(intent);
            }}
          />
        </HideablePrompt>
      ) : !spectating &&
        mySeat != null &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].kind !== "order_effects" &&
        view.pendingChoices[0].seat === mySeat ? (
        <HideablePrompt
          name={promptSourceName(view.pendingChoices[0])}
          dodge={promptBattle}
          hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
          onShow={() => setHiddenChoiceId(null)}
        >
          <ChoicePrompt
            key={view.pendingChoices[0].id}
            choice={view.pendingChoices[0]}
            mySeat={mySeat}
            view={view}
            hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
            onHide={() => setHiddenChoiceId(view.pendingChoices?.[0]?.id ?? null)}
            onSend={(intent) => {
              setHandFilter(null);
              setSelectedBoardId(null);
              onSendIntent(intent);
            }}
          />
        </HideablePrompt>
      ) : hotseatPass &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat !== mySeat ? (
        <div className="ability-prompt ability-prompt-waiting" role="status">
          <h3>Waiting for opponent</h3>
          <p>{view.pendingChoices[0].prompt}</p>
          <p className="meta">They are resolving an effect choice.</p>
        </div>
      ) : null}

      {docked ? (
        <PrimaryDock
          primary={dock.primary}
          extras={dock.extras}
          keyOffset={cardIntents.length}
          waiting={oppWait}
          view={view}
          disabled={over}
          confirmEndTurn={endTurnWarning(prefs.endTurnConfirm, view.legalIntents)}
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
          onConfirm={confirmAttach}
          onCancel={clearDonSelection}
        />
      ) : null}

      {over && resultHidden ? (
        <div
          className={`match-result-pill match-result-${result.outcome}${wide && !lp ? " match-result-pill-rail" : ""}`}
          role="status"
        >
          <span>
            Match over · {result.headline}
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => setResultHidden(false)}>
            Show result
          </button>
        </div>
      ) : null}

      {over && !resultHidden ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className={`modal-card match-result match-result-${result.outcome}`}>
            <p className="match-result-kicker">Match over</p>
            <h2>
              {(() => {
                // Spectators / hotseat: name the winning player instead of "Seat N".
                const winner = (matchOver?.winner ?? view.winner) as Seat | null;
                return spectating && players && (winner === 0 || winner === 1)
                  ? winnerHeadline(players, winner, null, true)
                  : result.headline;
              })()}
            </h2>
            <p className="match-result-detail">{result.detail}</p>
            <MatchOverFactsList
              matchId={matchId}
              turnNumber={view.turnNumber}
              loadRecord={spectating ? undefined : loadMatchRecord}
            />
            <button type="button" className="btn btn-secondary match-result-board" onClick={() => setResultHidden(true)}>
              View board
            </button>
            {rematch && !spectating ? (
              <RematchPanel
                state={rematch.state}
                mySeat={boardSeat}
                players={players}
                autoAccept={rematch.autoAccept}
                onAction={rematch.onAction}
              />
            ) : null}
            <button type="button" className="leave-btn" onClick={onLeave}>
              Return home
            </button>
          </div>
        </div>
      ) : null}
    </div>
    </PromptSlotContext.Provider>
    </MatchViewerSeatContext.Provider>
  );
}
