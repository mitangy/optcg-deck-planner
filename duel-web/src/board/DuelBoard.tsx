import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { ChatPanel } from "./ChatPanel";
import type { BattleLogEntry } from "./battleLog";
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
  resolveDropIntents,
  type DragPayload,
} from "./dragIntents";
import { AttackIndicator } from "./AttackIndicator";
import { BoardMotion } from "./BoardMotion";
import { describeBattle } from "./battleBanner";
import { battleEndpoints } from "./battleArc";
import { canOfferFullscreen, readInstallEnv } from "../installPrompt";
import { useScreenWakeLock } from "./wakeLock";
import { DonAttachConfirm, DonQuickRow, DragGhost, type GhostPayload } from "./BoardOverlays";
import {
  attachTargetIds,
  beginAttach,
  donIdsForTarget,
  donQuickAttach,
  nextDonSelection,
  pruneDonSelection,
  quickAttachCounts,
  resolveAttachIntents,
  type PendingAttach,
} from "./donSelection";
import { ChoicePrompt } from "./ChoicePrompt";
import { EffectOrderPrompt } from "./EffectOrderPrompt";
import { canFloat, FloatingPrompt } from "./FloatingPrompt";
import { IntentBar } from "./IntentBar";
import { DefendTray } from "./DefendTray";
import { deriveDefend } from "./defendModel";
import { clockFraction, resolveStagedCounters } from "./defendTray";
import { ReplacePrompt } from "./ReplacePrompt";
import {
  attackTargetIdsForAttacker,
  findAttackIntent,
  hasBoardActions,
} from "./intentFilter";
import { SideField } from "./SideField";
import { lookupCard } from "../cards/atlas";
import { sortHandIndices } from "./handSort";
import { useCardBackUrl } from "../cardBack";
import { usePlaymatUrl } from "../playmat";
import { useDuelSettings } from "../settings";
import { endTurnWarning, responseStopPass } from "./gameplayPrefs";
import { GameplaySettingsSheet } from "./GameplaySettings";
import { HotkeyHelpSheet } from "./HotkeyHelp";
import { stepHandSelection } from "./hotkeys";
import { useBoardHotkeys } from "./useBoardHotkeys";
import { audioUnlocked, unlockAudio, useTurnAlert } from "./turnAlert";
import { incomingAttackKey, useIncomingAttackCue } from "./attackCue";
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
import { seatLabel, seatName, winnerHeadline } from "./playerNames";
import { ConfirmButton } from "./ConfirmButton";
import { RematchPanel } from "./RematchPanel";
import { RoomChip } from "./RoomShare";
import { PendingBoard, type BoardWaiting } from "./PendingBoard";
import { fanPose } from "./handFan";
import { OppHandFan, OppHandHint, TurnStatusPanel, type SeatClocks } from "./TurnStatusPanel";
import { TurnSplash, type SplashMessage } from "./TurnSplash";
import { getLastHoverAt, getPreviewCard, setAutoPreviewCard, shouldAutoPreview } from "./cardPreview";
import { latestOpponentPlay, opponentPlayCaption } from "./opponentPlay";
import { useMediaQuery, WIDE_BOARD_QUERY, COMPACT_HUD_QUERY, PORTRAIT_MAT_QUERY, LANDSCAPE_PHONE_QUERY, RAIL_HAND_QUERY, TILT_BOARD_QUERY } from "./useMediaQuery";
import { MatchMenu } from "./MatchMenu";
import { LandscapeRail, LandscapeOverlay, type LandscapePanel } from "./LandscapeRail";
import { matchMenuItems } from "./matchMenuItems";
import { isPromptHidden } from "./promptHide";
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
  /** Searches and effect ordering float cards over the board instead of a pop-up (default on; `/demo?box` shows the pop-up). */
  floatingPrompts?: boolean;
  /** Before the first view: what the empty board says (queueing, connecting, starting). */
  waiting?: BoardWaiting;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

const EMPTY_IDS = new Set<string>();

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
  leaveLabel = "Leave",
  floatingPrompts = true,
  waiting,
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  /** Id of the choice whose pop-up the player tucked away to look at the hand/board. */
  const [hiddenChoiceId, setHiddenChoiceId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  /** Wide layout: hand dock pinned open (click / tap on its handle). */
  const prefs = useDuelSettings();
  const [handPinned, setHandPinned] = useState(prefs.keepHandOpen);
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const compactHud = useMediaQuery(COMPACT_HUD_QUERY);
  const portraitMat = useMediaQuery(PORTRAIT_MAT_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  /** Landscape phone: icon rail + overlays on the left, slim action column on the right. */
  const lp = wide && landscapePhone;
  /** Desktop: the hand fans off the bottom edge of the board (centre) or the rail (right). */
  const fanHand = wide && !lp && prefs.handLayout !== "grid";
  const fanCenter = fanHand && prefs.handLayout === "fanCenter";
  /** Desktop / landscape tablet: the board leans back in perspective, seen from your seat. */
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  const tilted = wide && !lp && tiltFits && prefs.tiltedBoard;
  /** Tall desktop, Grid layout: the hand is an always-open grid in the right rail (no dock). */
  const railHandTall = useMediaQuery(RAIL_HAND_QUERY);
  const railHand = wide && !lp && railHandTall && !fanHand;
  /** Portrait phones: the hand strip overlaps its cards in a fan instead of scrolling. */
  const phoneFan = !wide && prefs.handLayout !== "grid";
  const [lpPanel, setLpPanel] = useState<LandscapePanel | null>(null);
  // Starting a drag (or leaving landscape) must never leave an overlay over the board.
  useEffect(() => {
    if (dragPayload || !lp) setLpPanel(null);
  }, [dragPayload, lp]);
  const [handSorted, setHandSorted] = useState(prefs.sortHandByCost);
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
  useEffect(() => setHandPinned(prefs.keepHandOpen), [prefs.keepHandOpen]);
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
  const midlineText = view
    ? view.pendingChoices?.length
      ? view.pendingChoices[0].prompt
      : view.battle
        ? describeBattle(view, (defId) => lookupCard(defId).name)
        : null
    : null;
  // Screen stays on through the opponent's long turns; released when the match ends.
  useScreenWakeLock(!over);
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
  const autoPass =
    stopMode !== "always" && view && !spectating && !over && !view.pendingChoices?.length
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
  const defendKey =
    trayHere && view ? `${view.turnNumber}:${defend.phase}:${JSON.stringify(view.battle ?? null)}` : null;
  useEffect(() => {
    // A new attack / step (or the tray closing) starts from a clean slate.
    setStagedCounterIds([]);
    setStagedBlockerId(null);
  }, [defendKey]);

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
  useSoundCues(view, battleLog, previewOppSeat, {
    enabled: alertsOn,
    sound: prefs.turnSound,
    spectating,
  });

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
  /** Counter step: a Counter card can be dragged from hand onto the defender. */
  const counterDragEnabled = defend?.phase === "counter";
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

  function clearDonSelection() {
    setSelectedDonIds(new Set());
    setPendingAttach(null);
  }

  function confirmAttach() {
    const toSend = resolveAttachIntents(intents, pendingAttach);
    clearDonSelection();
    if (toSend.length === 0) return;
    setHandFilter(null);
    setSelectedBoardId(null);
    // Sequential client-side intents (no batch protocol).
    for (const intent of toSend) onSendIntent(intent);
  }

  useBoardHotkeys({
    spectating,
    over,
    // H only toggles the fan / corner dock; the rail hand is always open.
    wide: wide && !railHand,
    cardKeys: wide && !lp,
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
    },
    onToggleHand: () => {
      setHandPinned((v) => !v);
      if (handPinned) setHandFilter(null);
    },
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
    if (!view || spectating || !handSorted) return null;
    return sortHandIndices(view.you.hand, (defId) => lookupCard(defId).cost);
  }, [view, spectating, handSorted]);

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
      }
      for (const intent of toSend) onSendIntent(intent);
      if (payload.type === "give_don") clearDonSelection();
    }
  }

  function selectHandCard(idx: number) {
    setSelectedBoardId(null);
    setHandFilter((prev) => (prev === idx ? null : idx));
  }

  function selectBoardCard(id: string) {
    if (selectedDonIds.size > 0) {
      // DON!! selected → tapping a legal Leader/Character asks to attach.
      const pending = beginAttach(intents, selectedDonIds, id);
      if (pending) {
        setPendingAttach(pending);
        return;
      }
      clearDonSelection();
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

  function selectAttackTarget(targetId: string) {
    if (!view || !selectedBoardId) return;
    const intent = findAttackIntent(intents, selectedBoardId, targetId, view.opponent.leader.id);
    if (intent) {
      setSelectedBoardId(null);
      onSendIntent(intent);
    }
  }

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

  const ghostPayload: GhostPayload | null =
    dragPayload?.type === "give_don"
      ? { type: "give_don", count: dragPayload.donIds.length }
      : (dragPayload?.type === "play_card" || dragPayload?.type === "counter") &&
          you.hand[dragPayload.handIndex]
        ? {
            type: dragPayload.type,
            defId: you.hand[dragPayload.handIndex]!.defId,
            ownerSeat: mySeat ?? view.seat,
          }
        : dragPayload?.type === "attack"
          ? (() => {
              const card = [you.leader, ...you.characters].find(
                (c) => c.id === dragPayload.attackerId,
              );
              return card
                ? { type: "attack" as const, defId: card.defId, ownerSeat: mySeat ?? view.seat }
                : null;
            })()
          : null;

  const pendingAttachName = (() => {
    if (!pendingAttach) return "";
    const card =
      you.leader.id === pendingAttach.targetId
        ? you.leader
        : you.characters.find((c) => c.id === pendingAttach.targetId);
    return card ? lookupCard(card.defId).name : "target";
  })();
  const quickTargetName = (() => {
    const card =
      you.leader.id === selectedBoardId
        ? you.leader
        : you.characters.find((c) => c.id === selectedBoardId);
    return card ? lookupCard(card.defId).name : "card";
  })();
  const boardSeat: Seat = mySeat ?? view.seat;
  const oppSeat: Seat = boardSeat === 0 ? 1 : 0;
  const viewingSeat: Seat | undefined = spectating ? undefined : boardSeat;
  // Older servers omit firstSeat; they always started seat 0.
  const firstSeat: Seat = view.firstSeat ?? 0;
  const youFirst = boardSeat === firstSeat;
  const orderLabel = spectating
    ? `Seat ${firstSeat} goes first`
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
  const handOpen = handPinned || decidingMulligan || handFilter != null;

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

  /** `fanned`: each card gets its tilt and arc drop (see handFan.ts). */
  function renderHandCards(fanned = false) {
    const pose = (i: number, n: number): CSSProperties | undefined => {
      if (!fanned) return undefined;
      const p = fanPose(i, n);
      return { "--rot": `${p.rot.toFixed(2)}deg`, "--drop": p.drop.toFixed(4) } as CSSProperties;
    };
    if (spectating) {
      const n = Math.min(you.handCount ?? 0, 8);
      return Array.from({ length: n }).map((_, i) => (
        <span key={i} className="card-back hand-back" style={pose(i, n)} />
      ));
    }
    const order = handDisplayIndices ?? you.hand.map((_, i) => i);
    return order.map((idx, pos) => {
      const c = you.hand[idx]!;
      const playable = dndEnabled && canDragHandCard(intents, idx);
      const counterable = !playable && counterDragEnabled && canDragCounter(intents, idx);
      const payload: DragPayload = counterable
        ? { type: "counter", handIndex: idx }
        : { type: "play_card", handIndex: idx };
      return (
        <CardTile
          key={c.id}
          motionId={c.id}
          defId={c.defId}
          playCost={c.playCost}
          showCounter
          selected={handFilter === idx}
          onClick={() => selectHandCard(idx)}
          instantClick
          dragEnabled={playable || counterable}
          dragPayload={payload}
          onDragStart={() => setDragPayload(payload)}
          onDragEnd={(x, y) => commitDrop(payload, x, y)}
          onDragCancel={() => setDragPayload(null)}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
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
          ? { label: "Confirm counter", onPress: confirmCounters }
          : { label: defend.remaining === 0 ? "Done" : "Take hit" }
      : undefined;

  const defendTray =
    trayHere && defend ? (
      <DefendTray
        model={defend}
        ownerSeat={boardSeat}
        clock={clockFraction(timer, now, boardSeat)}
        onToggleBlocker={(id) => setStagedBlockerId((cur) => (cur === id ? null : id))}
        onToggleCounter={(id) =>
          setStagedCounterIds((cur) =>
            cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
          )
        }
        onCounterEvent={(i) => {
          const intent = defend.events[i]?.intent;
          if (intent) onSendIntent(intent);
        }}
        counterDrag={
          defend.phase === "counter"
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

  const intentPanel = !spectating ? (
    <IntentBar
      intents={(() => {
        const front = view.pendingChoices?.[0];
        // ChoicePrompt / EffectOrderPrompt own every pending-choice answer.
        const structuredOwns = Boolean(front);
        if (!structuredOwns) {
          // The quick row replaces the row of identical "Give DON" buttons.
          return quickCounts.length > 0
            ? view.legalIntents.filter(
                (i) => !(i.type === "give_don" && i.targetId === selectedBoardId),
              )
            : view.legalIntents;
        }
        return view.legalIntents.filter(
          (i) => i.type !== "resolve_pending_choice" && i.type !== "order_pending_effects",
        );
      })()}
      view={view}
      disabled={over}
      filterHandIndex={handFilter}
      selectedBoardId={selectedBoardId}
      confirmEndTurn={endTurnWarning(prefs.endTurnConfirm, view.legalIntents)}
      onSend={(intent) => {
        setHandFilter(null);
        setSelectedBoardId(null);
        onSendIntent(intent);
      }}
      onChooseReplace={openReplace}
      defend={defendPrimary}
      emptyHint={quickCounts.length > 0 ? "Use the DON!! buttons by the card" : undefined}
    />
  ) : (
    <div className="intent-bar">
      <p className="intent-empty">Spectating — both hands hidden; intents disabled</p>
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
  // Practice: both halves are yours, so both show your playmat and card back.
  // Online: the opponent's own art, shared through the game server.
  const oppSkin = seatSkins?.[oppSeat] ?? null;
  const oppMatUrl = hotseatPass ? playmatUrl : (oppSkin?.playmat ?? null);
  const oppCardBackUrl = hotseatPass ? cardBackUrl : (oppSkin?.cardBack ?? null);

  const hudUndoPass = (
    <>
    {undo && undoState?.enabled && !spectating && !over ? (
      undoPendingMine ? (
        <button
          type="button"
          className="hud-undo-btn hud-icon-btn armed"
          aria-label="Cancel undo request"
          title="Waiting for your opponent to accept — tap to cancel"
          onClick={() => undo.onAction("cancel")}
        >
          ↺ Cancel
        </button>
      ) : undoPendingTheirs ? null : (
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
      <button
        type="button"
        className="hud-pass-btn"
        title={`Pass device to seat ${hotseatPass.otherSeat}`}
        onClick={hotseatPass.onPass}
      >
        Pass → {hotseatPass.otherSeat}
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
        seat: spectating ? "Spectating" : `Seat ${mySeat}`,
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
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${oppActive ? " opp-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }${wide ? " arena-wide" : ""}${lp ? " arena-lp" : ""}${fanCenter ? " arena-fan-center" : fanHand ? " arena-fan-right" : ""}${
        tilted ? " arena-tilt" : ""
      }`}
      // Read by the e2e click-through tests (duel-web/e2e) to follow the game.
      data-phase={view.phase}
      data-turn={view.turnNumber}
      data-seat={boardSeat}
    >
      {lp ? null : compactHud ? (
        <header className="hud-bar hud-compact">
          <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
            <span className="hud-phase">{view.phase}</span>
            <span className="hud-sep">·</span>
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
                title={`${spectating ? `Seat ${boardSeat}` : "Your"} time ${seatClocks.you} · ${
                  spectating ? `Seat ${oppSeat}` : "Opponent's"
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
            <span className="hud-phase">{view.phase}</span>
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
            ) : (
              <span>{spectating ? "Spectating" : `Seat ${mySeat}`}</span>
            )}
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
                title={`Pass device to seat ${hotseatPass.otherSeat}`}
                onClick={hotseatPass.onPass}
              >
                Pass → {hotseatPass.otherSeat}
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
        <div className="mulligan-banner" role="status">
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

      <div className="arena-body">
        {lp ? (
          <LandscapeRail
            open={lpPanel}
            onToggle={(panel) => setLpPanel((cur) => (cur === panel ? null : panel))}
            hasChat={Boolean(chat)}
            logCount={battleLog.length}
            menu={matchMenuEl("left")}
          />
        ) : wide ? (
          <aside className="arena-left" aria-label="Card preview and battle log">
            <CardPreviewPanel />
            {!lp ? <RecentPlaysStrip entries={battleLog} youSeat={previewOppSeat === 0 ? 1 : 0} /> : null}
            <BattleLogPanel
              entries={battleLog}
              viewingSeat={spectating || mySeat == null ? undefined : mySeat}
              alwaysOpen
            />
          </aside>
        ) : null}

        <div className="playmat">
          <div className="playmat-inner">
            <OppHandHint count={opp.handCount} cardBackUrl={oppCardBackUrl} />

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
                faceUpLife: portraitMat ? opp.faceUpLife : undefined,
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

            <div className="midline">
              {midlineText ? (
                <div className="prompt" title={midlineText}>
                  {midlineText}
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
              matImageUrl={playmatUrl}
              matDim={playmatDim}
              matOpacity={playmatOpacity}
              cardBackUrl={cardBackUrl}
              ownerSeat={boardSeat}
              viewingSeat={viewingSeat}
              data={{
                leader: you.leader,
                characters: you.characters,
                stage: you.stage,
                deckCount: you.deckCount,
                trash: you.trash,
                lifeCount: you.lifeCount,
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

        {wide ? (
          <div className="arena-rail">
            {lp && (hotseatPass || (undo && undoState?.enabled && !spectating && !over)) ? (
              <div className="lp-actions">{hudUndoPass}</div>
            ) : null}
            <OppHandFan count={opp.handCount} cardBackUrl={oppCardBackUrl} compact={lp} />
            <TurnStatusPanel
              view={view}
              boardSeat={boardSeat}
              firstSeat={firstSeat}
              players={players}
              spectating={spectating}
              turnClock={turnClock}
              matchClock={matchClock}
              seatClocks={seatClocks}
              compact={lp}
            />
            {lp ? defendTray : null}
            {intentPanel}
            {railHand ? (
              <section
                className={`rail-hand${dragPayload ? " is-dragging" : ""}`}
                aria-label={`Your hand: ${handCount} cards`}
              >
                <div className="rail-hand-head">
                  <span className="rail-hand-title">{spectating ? "Seat hand" : "Hand"}</span>
                  <span className="hand-rail-count">{handCount}</span>
                  {!spectating ? (
                    <button
                      type="button"
                      className={`hand-rail-btn${handSorted ? " active" : ""}`}
                      aria-pressed={handSorted}
                      onClick={() => setHandSorted((v) => !v)}
                    >
                      Sort
                    </button>
                  ) : null}
                </div>
                <div className="rail-hand-cards" ref={handRowRef}>
                  {renderHandCards()}
                </div>
              </section>
            ) : null}
            {lp ? null : chatPanel}
            {/* Reserves the strip the collapsed hand dock peeks into. */}
            {lp || railHand || fanCenter ? null : <div className="rail-dock-spacer" aria-hidden />}
          </div>
        ) : (
          <div className="arena-rail">
            {defendTray ?? (
              <div className={`hand-rail${handCollapsed ? " collapsed" : ""}`}>
                <div className="hand-rail-head">
                  <span className="hand-rail-title">{spectating ? "Seat hand (hidden)" : "Hand"}</span>
                  <span className="hand-rail-count">{handCount}</span>
                  {!spectating ? (
                    <div className="hand-rail-actions">
                      <button
                        type="button"
                        className={`hand-rail-btn${handSorted ? " active" : ""}`}
                        aria-pressed={handSorted}
                        onClick={() => setHandSorted((v) => !v)}
                      >
                        Sort
                      </button>
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
                        {handCollapsed ? "Show" : "Hide"}
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
          className={`hand-fan ${fanCenter ? "hand-fan-center" : "hand-fan-right"}${
            handOpen ? " is-open" : ""
          }${dragPayload ? " is-dragging" : ""}`}
          style={{ "--n": Math.max(handCount, 1) } as CSSProperties}
          aria-label={`Your hand: ${handCount} cards`}
        >
          <div className="hand-fan-head">
            <button
              type="button"
              className="hand-fan-toggle"
              aria-expanded={handOpen}
              title={handPinned ? "Let the hand tuck away (H)" : "Keep the hand up (H)"}
              onClick={() => {
                setHandPinned((v) => !v);
                if (handPinned) setHandFilter(null);
              }}
            >
              <span className="hand-fan-title">{spectating ? "Seat hand" : "Hand"}</span>
              <span className="hand-rail-count">{handCount}</span>
              <span className="hand-dock-caret" aria-hidden>
                {handOpen ? "▾" : "▴"}
              </span>
            </button>
            {!spectating ? (
              <button
                type="button"
                className={`hand-rail-btn${handSorted ? " active" : ""}`}
                aria-pressed={handSorted}
                onClick={() => setHandSorted((v) => !v)}
              >
                Sort
              </button>
            ) : null}
          </div>
          <div className="hand-fan-cards" ref={handRowRef}>
            {renderHandCards(true)}
          </div>
        </div>
      ) : wide && !railHand ? (
        <div
          className={`hand-dock${handOpen ? " is-open" : ""}${dragPayload ? " is-dragging" : ""}`}
          style={
            {
              "--n": Math.max(handCount, 1),
              "--n1": Math.max(handCount - 1, 1),
            } as CSSProperties
          }
          aria-label={`Your hand: ${handCount} cards`}
        >
          <div className="hand-dock-head">
            <button
              type="button"
              className="hand-dock-toggle"
              aria-expanded={handOpen}
              title={handPinned ? "Let the hand tuck away" : "Keep the hand open"}
              onClick={() => {
                setHandPinned((v) => !v);
                if (handPinned) setHandFilter(null);
              }}
            >
              <span>{spectating ? "Seat hand" : "Hand"}</span>
              <span className="hand-rail-count">{handCount}</span>
              <span className="hand-dock-caret" aria-hidden>
                {handOpen ? "▾" : "▴"}
              </span>
            </button>
            {!spectating ? (
              <button
                type="button"
                className={`hand-rail-btn${handSorted ? " active" : ""}`}
                aria-pressed={handSorted}
                onClick={() => setHandSorted((v) => !v)}
              >
                Sort
              </button>
            ) : null}
          </div>
          <div className="hand-dock-cards" ref={handRowRef}>
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
      ) : floatingPrompts &&
        prefs.floatingCards &&
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
      ) : !spectating &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat !== mySeat ? (
        <div className="ability-prompt ability-prompt-waiting" role="status">
          <h3>Waiting for opponent</h3>
          <p>{view.pendingChoices[0].prompt}</p>
          <p className="meta">They are resolving an effect choice.</p>
        </div>
      ) : null}

      {/* Fixed overlays (portals) — never participate in board layout. */}
      <TurnSplash message={splash} />
      <AttackIndicator view={over ? null : view} />
      <BoardMotion view={view} />
      <DragGhost payload={ghostPayload} />
      {quickCounts.length > 0 && selectedBoardId ? (
        <DonQuickRow
          targetId={selectedBoardId}
          targetName={quickTargetName}
          counts={quickCounts}
          onPick={quickAttach}
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

      {over ? (
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
  );
}
