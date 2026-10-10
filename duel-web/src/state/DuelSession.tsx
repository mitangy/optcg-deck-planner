import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { DuelClient } from "../net/duelClient";
import { mintAccountGameToken } from "../net/api";
import { getGameServerUrl } from "../config";
import {
  clearMatchResume,
  isResumeWithinGrace,
  isSeatReservationExpiredError,
  loadMatchResume,
  saveMatchResume,
  touchMatchResume,
} from "../net/matchResume";
import type {
  BriefTicketWire,
  ChatLine,
  Intent,
  MatchOverMessage,
  PlayerDeckWire,
  PlayerView,
  Seat,
  SeatPlayers,
  TimerMessage,
  RematchAction,
  RematchState,
  SeatSkin,
  UndoAction,
  UndoState,
} from "../net/protocol";
import { SKIN_MAX_CARD_BACK_CHARS, SKIN_MAX_PLAYMAT_CHARS } from "../net/protocol";
import { cardBackShareUrl } from "../cardBack";
import { playmatShareUrl } from "../playmat";
import { currentSettings } from "../settings";
import {
  initSeatArtPrefsFromStorage,
  replaceSeatArtPrefs,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
import {
  indexViewInstances,
  narrateEvents,
  rewindBattleLog,
  type BattleLogEntry,
  type InstanceIndex,
} from "../board/battleLog";

type ConnectOpts = {
  serverUrl?: string;
  devUserId?: string;
  gameToken?: string;
  secret?: string;
  roomId?: string;
  preferredSeat?: Seat;
  role?: "player" | "spectator";
  deck?: { leaderId: string; deck: string[] };
  /** Take over the seat `preferredSeat` this account holds in `roomId` (#451). */
  takeover?: boolean;
  ownerToken?: string;
  createOptions?: {
    ranked?: boolean;
    players?: [
      { leaderId: string; deck: string[] },
      { leaderId: string; deck: string[] },
    ];
    timer?: {
      turnSeconds?: number;
      matchSeconds?: number;
      seatSeconds?: number;
    };
  };
};

export const SPECTATOR_CAP_MESSAGE = "This match already has the most spectators.";

/** A match request: the board opens at once and shows this while it resolves. */
export type MatchLaunch = {
  /** Board status while connecting ("Searching for an opponent…"). */
  status: string;
  /** Your deck's Leader for the empty board (null when spectating). */
  leaderId: string | null;
  /** Private room: show the invite card until the opponent joins. */
  invite: boolean;
  /** Signed in with friends: the waiting board also shows invites sent to you. */
  friends?: boolean;
};

type DuelSession = {
  client: DuelClient;
  /** The latest match request (kept until Leave) for the pre-view board. */
  launch: MatchLaunch | null;
  /** True while that request's mint / queue / connect is still running. */
  launching: boolean;
  /**
   * Open the board now and run `task` (mint, queue, connect) behind it. A
   * failure lands in errorBanner; Leave before it settles abandons it.
   * `task` gets the launch's generation to hand to connect / queueRanked.
   */
  startMatch: (launch: MatchLaunch, task: (launchGen: number) => Promise<void>) => void;
  connected: boolean;
  /** Another device took this seat over (#451): the board is frozen and nothing reconnects. */
  takenOver: boolean;
  /**
   * Move a live match to this device: take over `seat` of `roomId` behind the
   * board. `mintToken` supplies the account's game token (default: sign-in session).
   */
  takeOver: (roomId: string, seat: Seat, mintToken?: () => Promise<string>) => void;
  queueing: boolean;
  canReconnect: boolean;
  /** True while a sessionStorage resume is in flight (blocks lobby redirect). */
  resuming: boolean;
  /** True while the socket dropped and a reclaim of the seat is in flight. */
  reconnecting: boolean;
  matchId: string | null;
  seat: Seat | null;
  role: "player" | "spectator";
  view: PlayerView | null;
  /** Seat-indexed display names from the server welcome (usernames when set). */
  players: SeatPlayers | null;
  /** Whether the room is ranked, from the welcome; null until then or from an older server. */
  ranked: boolean | null;
  /** The key to a Log Pose matchup brief (players of unranked rooms only). */
  brief: BriefTicketWire | null;
  battleLog: BattleLogEntry[];
  clearBattleLog: () => void;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  timer: TimerMessage | null;
  /** Match chat (online matches only; cleared when a new match starts). */
  chat: ChatLine[];
  sendChat: (text: string) => void;
  /** Players: tell the room the order of your hand (spectators' fans follow it). */
  sendHandOrder: (ids: string[]) => void;
  /** Undo availability (private rooms); null until the server reports it. */
  undo: UndoState | null;
  /** Per seat: epoch ms until which a dropped player may reconnect (else null). */
  awayUntil: [number | null, number | null];
  /** Per seat: custom playmat / card back shared by that player (online). */
  seatSkins: [SeatSkin | null, SeatSkin | null];
  /** Rematch vote once the match is over (null until the server reports it). */
  rematch: RematchState | null;
  sendRematch: (action: RematchAction, deck?: PlayerDeckWire) => void;
  sendUndo: (action: UndoAction) => void;
  rating: number | null;
  lastServerUrl: string | null;
  /** `launchGen` is the startMatch generation; a superseded launch never reaches the client. */
  connect: (opts: ConnectOpts, launchGen: number) => Promise<void>;
  queueRanked: (
    opts: Pick<ConnectOpts, "serverUrl" | "devUserId" | "gameToken" | "secret" | "deck">,
    launchGen: number,
  ) => Promise<void>;
  cancelQueue: () => Promise<void>;
  reconnect: () => Promise<void>;
  tryResumeFromStorage: () => Promise<boolean>;
  sendIntent: (intent: Intent) => void;
  concede: () => void;
  leave: () => Promise<void>;
  clearError: () => void;
  setRating: (n: number | null) => void;
};

/** A match request dropped by Leave or a newer request. */
export class LaunchCancelledError extends Error {
  constructor() {
    super("Match request cancelled");
  }
}

const Ctx = createContext<DuelSession | null>(null);

export function DuelSessionProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef(new DuelClient());
  const serverUrlRef = useRef<string | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const [connected, setConnected] = useState(false);
  const [takenOver, setTakenOver] = useState(false);
  const [launch, setLaunch] = useState<MatchLaunch | null>(null);
  const [launching, setLaunching] = useState(false);
  /** Bumped by every startMatch / leave: a connect that finishes under an older value was abandoned. */
  const launchGenRef = useRef(0);
  const launchingRef = useRef(false);
  const [queueing, setQueueing] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [resuming, setResuming] = useState(() => loadMatchResume()?.mode === "duel");
  const [reconnecting, setReconnecting] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [role, setRole] = useState<"player" | "spectator">("player");
  const connectRoleRef = useRef<"player" | "spectator">("player");
  const [view, setView] = useState<PlayerView | null>(null);
  const [players, setPlayers] = useState<SeatPlayers | null>(null);
  const [ranked, setRanked] = useState<boolean | null>(null);
  const [brief, setBrief] = useState<BriefTicketWire | null>(null);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const viewRef = useRef<PlayerView | null>(null);
  /** Board instance ids → cards, so log lines can name attackers / blockers. */
  const instancesRef = useRef<InstanceIndex>(new Map());
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [matchOver, setMatchOver] = useState<MatchOverMessage["result"] | null>(null);
  const [timer, setTimer] = useState<TimerMessage | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [awayUntil, setAwayUntil] = useState<[number | null, number | null]>([null, null]);
  const [rematch, setRematch] = useState<RematchState | null>(null);
  const [seatSkins, setSeatSkins] = useState<[SeatSkin | null, SeatSkin | null]>([null, null]);
  const [rating, setRating] = useState<number | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  const value = useMemo<DuelSession>(() => {
    const client = clientRef.current;

    function persistToken(token: string, roomId: string) {
      const s = seatRef.current;
      const url = serverUrlRef.current;
      if (s !== 0 && s !== 1) return;
      if (!url) return;
      saveMatchResume({
        mode: "duel",
        serverUrl: url,
        roomId,
        reconnectionToken: token,
        seat: s,
        savedAt: Date.now(),
      });
    }

    function wireHandlers() {
      client.setHandlers({
        onWelcome: ({ matchId: id, seat: s, view: v, role: r, players: p, ranked: rk, brief: b }) => {
          setPlayers(p ?? null);
          setRanked(typeof rk === "boolean" ? rk : null);
          setBrief(r === "player" ? (b ?? null) : null);
          seatRef.current = s;
          setMatchId(id);
          setSeat(s);
          setRole(r);
          viewRef.current = v;
          instancesRef.current = new Map();
          indexViewInstances(v, instancesRef.current);
          setView(v);
          setBattleLog([]);
          // A welcome starts (or resyncs) a game: a rematch clears the last
          // result; a resync of a finished game re-sends match_over after this.
          setMatchOver(null);
          setRematch(null);
          setConnected(true);
          setReconnecting(false);
          setCanReconnect(r === "player");
          setQueueing(false);
          setResuming(false);
          if (r === "player" && (s === 0 || s === 1)) {
            setCosmeticsPublisher((publishSeat, prefs) => {
              if (publishSeat !== seatRef.current) return;
              client.sendCosmetics(prefs);
            });
            initSeatArtPrefsFromStorage(s);
            void Promise.all([
              playmatShareUrl(SKIN_MAX_PLAYMAT_CHARS),
              cardBackShareUrl(SKIN_MAX_CARD_BACK_CHARS),
            ]).then(([playmat, cardBack]) => {
              const donArt = currentSettings().donArt;
              if (playmat || cardBack || donArt) client.sendSkin({ playmat, cardBack, donArt });
            });
          }
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, id);
        },
        onView: (v) => {
          viewRef.current = v;
          indexViewInstances(v, instancesRef.current);
          setView(v);
        },
        onEvents: (events, step) => {
          const turn = viewRef.current?.turnNumber ?? 1;
          // Spectators follow a camera seat but are not "You".
          const youSeat = viewRef.current?.spectator ? null : seatRef.current;
          indexViewInstances(viewRef.current, instancesRef.current);
          const lines = narrateEvents(events, {
            youSeat,
            turnNumber: turn,
            instances: instancesRef.current,
          });
          if (lines.length) {
            const stamped = step === undefined ? lines : lines.map((l) => ({ ...l, step }));
            setBattleLog((prev) => [...prev, ...stamped]);
          }
        },
        onCosmetics: (msg) => {
          replaceSeatArtPrefs(msg.seat, msg.artPrefs);
        },
        onSkin: (msg) => {
          setSeatSkins((prev) => {
            const next: [SeatSkin | null, SeatSkin | null] = [prev[0], prev[1]];
            next[msg.seat] = msg.skin;
            return next;
          });
        },
        onError: (err) => {
          if (isSeatReservationExpiredError(err.message)) return;
          // A spectator who arrives before the first deal is not in trouble:
          // the board already says "Waiting for the match to start…".
          if (err.code === "match_not_ready" && !viewRef.current) return;
          if (err.code === "room_full" && connectRoleRef.current === "spectator") {
            resetMatch();
            setErrorBanner(SPECTATOR_CAP_MESSAGE);
            return;
          }
          if (err.code === "opponent_no_show") {
            // Ranked opponent never arrived and the room closed: back to the
            // lobby with the reason instead of "Waiting for opponent…" forever.
            resetMatch();
            setErrorBanner(err.message);
            return;
          }
          setErrorBanner(`${err.code}: ${err.message}`);
        },
        onStaleIllegalIntent: () => {
          // A late action's "Not your turn" must not linger into your next turn.
          setErrorBanner((b) => (b?.startsWith("illegal_intent:") ? null : b));
        },
        onMatchOver: (msg) => {
          setMatchOver(msg.result);
          setCanReconnect(false);
          clearMatchResume();
        },
        onTimer: (msg) => setTimer(msg),
        onChat: (lines) => {
          // History replays on every sync; merge by id so nothing duplicates.
          setChat((prev) => {
            const seen = new Set(prev.map((l) => l.id));
            const fresh = lines.filter((l) => !seen.has(l.id));
            return fresh.length ? [...prev, ...fresh].slice(-100) : prev;
          });
        },
        onUndoState: (state) => setUndo(state),
        onPresence: (away) => setAwayUntil(away),
        onRematchState: (state) => setRematch(state),
        onUndoApplied: ({ toTurn, toStep, by, action }) => {
          const youSeat = viewRef.current?.spectator ? null : seatRef.current;
          setBattleLog((prev) => rewindBattleLog(prev, toTurn, by, youSeat, toStep, action?.label));
        },
        onTakenOver: () => {
          // The seat is theirs now: keep the last board on screen, stop every
          // path that would reclaim it, and drop the (dead) resume token.
          setTakenOver(true);
          setConnected(false);
          setReconnecting(false);
          setCanReconnect(false);
          setQueueing(false);
          setResuming(false);
          clearMatchResume();
        },
        onDisconnect: () => {
          setConnected(false);
          setReconnecting(false);
          setQueueing(false);
        },
        onDrop: () => {
          setConnected(false);
          setReconnecting(true);
        },
        onReconnect: () => {
          setConnected(true);
          setReconnecting(false);
        },
        onQueued: () => setQueueing(true),
        onReconnectionToken: (token, roomId) => persistToken(token, roomId),
      });
    }

    /**
     * A connect settled after Leave (or a newer request): drop its socket and
     * state unless a newer request is already using the client.
     */
    function abandon(): Error {
      if (!launchingRef.current) {
        void client.disconnect(true);
        resetMatch();
      }
      return cancelled();
    }

    function cancelled(): Error {
      return new LaunchCancelledError();
    }

    function resetMatch() {
      clearMatchResume();
      setCosmeticsPublisher(null);
      resetAllSeatArtPrefs();
      setSeatSkins([null, null]);
      setTakenOver(false);
      // Don't wait for the server's close handshake (slow on a cold / busy
      // server): reset locally and let the socket close in the background.
      void client.disconnect(true);
      setAwayUntil([null, null]);
      setRematch(null);
      setConnected(false);
      setReconnecting(false);
      setQueueing(false);
      setCanReconnect(false);
      setResuming(false);
      setMatchId(null);
      setSeat(null);
      seatRef.current = null;
      setRole("player");
      setView(null);
      setPlayers(null);
      setRanked(null);
      setBrief(null);
      setMatchOver(null);
      setTimer(null);
      setChat([]);
      setUndo(null);
    }

    return {
      client,
      launch,
      launching,
      connected,
      takenOver,
      takeOver(roomId, seat, mintToken) {
        value.startMatch(
          { status: "Moving the match here…", leaderId: null, invite: false },
          async (gen) => {
            const gameToken = mintToken ? await mintToken() : (await mintAccountGameToken()).token;
            await value.connect(
              {
                serverUrl: serverUrlRef.current ?? getGameServerUrl(),
                gameToken,
                roomId,
                preferredSeat: seat,
                takeover: true,
              },
              gen,
            );
          },
        );
      },
      queueing,
      canReconnect,
      resuming,
      reconnecting,
      matchId,
      seat,
      role,
      view,
      players,
      ranked,
      brief,
      battleLog,
      clearBattleLog: () => setBattleLog([]),
      errorBanner,
      matchOver,
      timer,
      chat,
      sendChat(text) {
        try {
          client.sendChat(text);
        } catch (e) {
          setErrorBanner(e instanceof Error ? e.message : "Chat failed");
        }
      },
      sendHandOrder: (ids) => client.sendHandOrder(ids),
      undo,
      awayUntil,
      seatSkins,
      rematch,
      sendRematch(action, deck) {
        try {
          client.sendRematch(action, deck);
        } catch (e) {
          setErrorBanner(e instanceof Error ? e.message : "Rematch failed");
        }
      },
      sendUndo(action) {
        try {
          client.sendUndo(action);
        } catch (e) {
          setErrorBanner(e instanceof Error ? e.message : "Undo failed");
        }
      },
      rating,
      lastServerUrl,
      setRating,
      async connect(opts, gen) {
        // Left or relaunched while the task was minting / fetching the deck:
        // touch neither the client nor the newer match's state.
        if (launchGenRef.current !== gen) throw cancelled();
        setErrorBanner(null);
        setTakenOver(false);
        setMatchOver(null);
        setTimer(null);
        setChat([]);
        setUndo(null);
        setView(null);
        setRanked(null);
        setBrief(null);
        setQueueing(false);
        setResuming(false);
        setRole(opts.role ?? "player");
        connectRoleRef.current = opts.role ?? "player";
        if (opts.serverUrl) {
          serverUrlRef.current = opts.serverUrl;
          setLastServerUrl(opts.serverUrl);
        }
        wireHandlers();
        const info = await client.connect(opts);
        if (launchGenRef.current !== gen) throw abandon();
        seatRef.current = info.seat;
        flushSync(() => {
          setMatchId(info.matchId);
          setSeat(info.seat);
          setConnected(true);
          setCanReconnect((opts.role ?? "player") === "player");
        });
        const tok = client.getReconnectionToken();
        if (tok) persistToken(tok, info.matchId);
      },
      async queueRanked(opts, gen) {
        if (launchGenRef.current !== gen) throw cancelled();
        setErrorBanner(null);
        setMatchOver(null);
        setTimer(null);
        setChat([]);
        setUndo(null);
        setView(null);
        setTakenOver(false);
        setQueueing(true);
        setResuming(false);
        if (opts.serverUrl) {
          serverUrlRef.current = opts.serverUrl;
          setLastServerUrl(opts.serverUrl);
        }
        wireHandlers();
        try {
          const info = await client.queueRanked(opts);
          if (launchGenRef.current !== gen) throw abandon();
          seatRef.current = info.seat;
          flushSync(() => {
            setMatchId(info.matchId);
            setSeat(info.seat);
            setConnected(true);
            setCanReconnect(true);
            setQueueing(false);
          });
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, info.matchId);
        } catch (e) {
          setQueueing(false);
          throw e;
        }
      },
      async cancelQueue() {
        await client.cancelQueue();
        setQueueing(false);
      },
      async reconnect() {
        setErrorBanner(null);
        setReconnecting(true);
        wireHandlers();
        try {
          const info = await client.reconnect({
            serverUrl: serverUrlRef.current ?? undefined,
          });
          seatRef.current = info.seat;
          setMatchId(info.matchId);
          setSeat(info.seat);
          setConnected(true);
          setReconnecting(false);
          setCanReconnect(true);
          setResuming(false);
        } catch (e) {
          clearMatchResume();
          setReconnecting(false);
          setCanReconnect(false);
          setResuming(false);
          setErrorBanner(
            isSeatReservationExpiredError(e)
              ? "You were away too long and your seat was released."
              : e instanceof Error
                ? e.message
                : "Reconnect failed",
          );
          throw e;
        }
      },
      async tryResumeFromStorage() {
        const blob = loadMatchResume();
        if (!blob || blob.mode !== "duel") {
          setResuming(false);
          return false;
        }
        // Past Colyseus grace → token is dead; skip instead of surfacing
        // "seat reservation expired" on every late refresh.
        if (!isResumeWithinGrace(blob.savedAt)) {
          clearMatchResume();
          setResuming(false);
          return false;
        }
        setResuming(true);
        setErrorBanner(null);
        serverUrlRef.current = blob.serverUrl;
        setLastServerUrl(blob.serverUrl);
        seatRef.current = blob.seat;
        wireHandlers();
        try {
          const info = await client.reconnect({
            serverUrl: blob.serverUrl,
            reconnectionToken: blob.reconnectionToken,
          });
          seatRef.current = info.seat;
          flushSync(() => {
            setMatchId(info.matchId);
            setSeat(info.seat);
            setConnected(true);
            setCanReconnect(true);
            setResuming(false);
          });
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, info.matchId);
          return true;
        } catch (e) {
          clearMatchResume();
          setResuming(false);
          const msg = e instanceof Error ? e.message : "Resume failed";
          // Expired grace tokens are expected after idle / free-tier sleep —
          // don't leave a scary banner on the lobby redirect path.
          if (!isSeatReservationExpiredError(msg)) {
            setErrorBanner(msg);
          }
          return false;
        }
      },
      sendIntent(intent) {
        try {
          client.sendIntent(intent);
        } catch (e) {
          setErrorBanner(e instanceof Error ? e.message : "Send failed");
        }
      },
      concede() {
        try {
          client.concede();
        } catch (e) {
          setErrorBanner(e instanceof Error ? e.message : "Concede failed");
        }
      },
      startMatch(next, task) {
        const gen = ++launchGenRef.current;
        launchingRef.current = true;
        setErrorBanner(null);
        setTakenOver(false);
        setView(null);
        setMatchId(null);
        setSeat(null);
        setLaunch(next);
        setLaunching(true);
        const settle = () => {
          launchingRef.current = false;
          setLaunching(false);
        };
        task(gen).then(
          () => {
            if (launchGenRef.current === gen) settle();
          },
          (e: unknown) => {
            if (launchGenRef.current !== gen) return;
            settle();
            setQueueing(false);
            setErrorBanner(e instanceof Error ? e.message : "Connect failed");
          },
        );
      },
      async leave() {
        launchGenRef.current++;
        launchingRef.current = false;
        setLaunching(false);
        setLaunch(null);
        resetMatch();
      },
      clearError() {
        setErrorBanner(null);
      },
    };
  }, [
    launch,
    launching,
    connected,
    takenOver,
    queueing,
    canReconnect,
    resuming,
    reconnecting,
    matchId,
    seat,
    role,
    view,
    players,
    ranked,
    brief,
    battleLog,
    errorBanner,
    matchOver,
    timer,
    chat,
    undo,
    awayUntil,
    seatSkins,
    rematch,
    rating,
    lastServerUrl,
  ]);

  useEffect(() => {
    const blob = loadMatchResume();
    if (blob?.mode !== "duel") {
      setResuming(false);
      return;
    }
    void value.tryResumeFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valueRef = useRef(value);
  valueRef.current = value;

  // Phones suspend the page (and often its socket) while another app is in
  // front. Keep the resume blob's clock at "last seen alive" so a discarded tab
  // can still reclaim its seat on reload, and on return reclaim at once instead
  // of waiting for a tap on the Reconnect banner.
  useEffect(() => {
    let checking = false;
    async function recoverIfDropped() {
      const s = valueRef.current;
      if (checking || s.role !== "player" || !s.canReconnect || !s.matchId || s.matchOver) return;
      const client = s.client;
      if (client.isReconnecting || !client.getReconnectionToken()) return;
      checking = true;
      try {
        if (await client.isAlive()) return;
        // The SDK may have noticed the close while we waited; let it finish.
        if (client.isReconnecting) return;
        await valueRef.current.reconnect();
      } catch {
        /* reconnect() already set the banner */
      } finally {
        checking = false;
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void recoverIfDropped();
      else if (valueRef.current.connected) touchMatchResume();
    };
    const onPageHide = () => {
      if (valueRef.current.connected) touchMatchResume();
    };
    const onResume = () => void recoverIfDropped();
    const heartbeat = window.setInterval(() => {
      if (valueRef.current.connected) touchMatchResume();
    }, 5000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
    };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDuelSession(): DuelSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDuelSession outside provider");
  return ctx;
}
