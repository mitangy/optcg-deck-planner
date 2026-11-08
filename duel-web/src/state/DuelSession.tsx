import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  UndoRequestOptions,
  UndoState,
} from "../net/protocol";
import { buildSharedSkin, isSkinPathRejected } from "../skinShare";
import {
  initSeatArtPrefsFromStorage,
  replaceSeatArtPrefs,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
import type { BattleLogEntry } from "../board/match/battleLog";
import { classifyServerError, createMatchStore, SPECTATOR_CAP_MESSAGE, type MatchStore } from "./matchStore";
import { MatchStoreContext } from "./useMatch";

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
    bot?: { level: "easy" | "normal" | "hard"; deck: { leaderId: string; deck: string[] } };
  };
};

export { SPECTATOR_CAP_MESSAGE };

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
  /** How the turn order was decided, from the welcome: null = coin flip, a seat = who chose; undefined from an older server. */
  firstSeatPickedBy: Seat | null | undefined;
  /** The key to a Log Pose matchup brief (players of unranked rooms only). */
  brief: BriefTicketWire | null;
  /** Play vs Bot: the other seat is the server's bot, which cannot be reported. */
  vsBot: boolean;
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
  sendUndo: (action: UndoAction, opts?: UndoRequestOptions) => void;
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

type SessionActions = Pick<
  DuelSession,
  | "client"
  | "takeOver"
  | "clearBattleLog"
  | "sendChat"
  | "sendHandOrder"
  | "sendRematch"
  | "sendUndo"
  | "setRating"
  | "connect"
  | "queueRanked"
  | "cancelQueue"
  | "reconnect"
  | "tryResumeFromStorage"
  | "sendIntent"
  | "concede"
  | "startMatch"
  | "leave"
  | "clearError"
>;

const Ctx = createContext<DuelSession | null>(null);

export function DuelSessionProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef(new DuelClient());
  /** Everything the server told us about the match lives in this store (see matchStore.ts); the session below only owns session concerns. */
  const storeRef = useRef<MatchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createMatchStore("online", { resuming: loadMatchResume()?.mode === "duel" });
  }
  const store = storeRef.current;
  const serverUrlRef = useRef<string | null>(null);
  /** The last skin sent carried an account upload path (see skinShare.ts). */
  const skinSentAsPathRef = useRef(false);
  const seatRef = useRef<Seat | null>(null);
  const [launch, setLaunch] = useState<MatchLaunch | null>(null);
  const [launching, setLaunching] = useState(false);
  /** Bumped by every startMatch / leave: a connect that finishes under an older value was abandoned. */
  const launchGenRef = useRef(0);
  const launchingRef = useRef(false);
  const connectRoleRef = useRef<"player" | "spectator">("player");
  const [rating, setRating] = useState<number | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  const match = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  /** The methods never change identity: they read the store and refs, not render-time state. */
  const actions = useMemo(() => {
    const client = clientRef.current;
    const { dispatch } = store;

    function persistToken(token: string, roomId: string) {
      const s = seatRef.current;
      // The server this match was created on, so a reload rejoins that pool.
      const url = serverUrlRef.current ?? client.serverUrl;
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
        onWelcome: (info) => {
          const { seat: s, role: r } = info;
          seatRef.current = s;
          // A welcome starts (or resyncs) a game; the reducer clears the last result / rematch / log.
          dispatch({ type: "welcome", info });
          if (r === "player" && (s === 0 || s === 1)) {
            setCosmeticsPublisher((publishSeat, prefs) => {
              if (publishSeat !== seatRef.current) return;
              client.sendCosmetics(prefs);
            });
            initSeatArtPrefsFromStorage(s);
            void buildSharedSkin().then((shared) => {
              if (!shared) return;
              skinSentAsPathRef.current = shared.usesPath;
              client.sendSkin(shared.skin);
            });
          }
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, info.matchId);
        },
        onView: (view) => dispatch({ type: "view", view }),
        onEvents: (events, step) => dispatch({ type: "events", events, step }),
        onCosmetics: (msg) => {
          replaceSeatArtPrefs(msg.seat, msg.artPrefs);
        },
        onSkin: (msg) => dispatch({ type: "skin", msg }),
        onError: (err) => {
          const outcome = classifyServerError(err, store.getSnapshot(), connectRoleRef.current);
          if (outcome.kind === "ignore") return;
          if (skinSentAsPathRef.current && isSkinPathRejected(err)) {
            // A game server from before public paths: share the art as data URLs instead.
            skinSentAsPathRef.current = false;
            void buildSharedSkin({ allowPaths: false }).then((shared) => {
              if (shared) client.sendSkin(shared.skin);
            });
            return;
          }
          if (outcome.kind === "reset") resetMatchEffects();
          dispatch({ type: "error", err, connectRole: connectRoleRef.current });
        },
        onStaleIllegalIntent: () => dispatch({ type: "staleIllegalIntent" }),
        onMatchOver: (msg) => {
          dispatch({ type: "matchOver", result: msg.result });
          clearMatchResume();
        },
        onTimer: (msg) => dispatch({ type: "timer", msg }),
        onChat: (lines) => dispatch({ type: "chat", lines }),
        onUndoState: (state) => dispatch({ type: "undoState", state }),
        onPresence: (awayUntil) => dispatch({ type: "presence", awayUntil }),
        onRematchState: (state) => dispatch({ type: "rematchState", state }),
        onUndoApplied: (info) => dispatch({ type: "undoApplied", info }),
        onTakenOver: () => {
          // The seat is theirs now: keep the last board on screen, stop every
          // path that would reclaim it, and drop the (dead) resume token.
          dispatch({ type: "takenOver" });
          clearMatchResume();
        },
        onDisconnect: () => dispatch({ type: "disconnect" }),
        onDrop: () => dispatch({ type: "drop" }),
        onReconnect: () => dispatch({ type: "reconnect" }),
        onQueued: () => dispatch({ type: "queued" }),
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

    /** Session-side half of leaving a match (resume blob, cosmetics, socket); `resetMatch` also clears the store. */
    function resetMatchEffects() {
      clearMatchResume();
      setCosmeticsPublisher(null);
      resetAllSeatArtPrefs();
      // Don't wait for the server's close handshake (slow on a cold / busy
      // server): reset locally and let the socket close in the background.
      void client.disconnect(true);
      seatRef.current = null;
    }

    function resetMatch() {
      resetMatchEffects();
      dispatch({ type: "reset" });
    }

    const actions: SessionActions = {
      client,
      takeOver(roomId, seat, mintToken) {
        actions.startMatch(
          { status: "Moving the match here…", leaderId: null, invite: false },
          async (gen) => {
            const gameToken = mintToken ? await mintToken() : (await mintAccountGameToken()).token;
            await actions.connect(
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
      clearBattleLog: () => dispatch({ type: "clearBattleLog" }),
      sendChat(text) {
        try {
          client.sendChat(text);
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Chat failed" });
        }
      },
      sendHandOrder: (ids) => client.sendHandOrder(ids),
      sendRematch(action, deck) {
        try {
          client.sendRematch(action, deck);
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Rematch failed" });
        }
      },
      sendUndo(action, opts) {
        try {
          client.sendUndo(action, opts);
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Undo failed" });
        }
      },
      setRating,
      async connect(opts, gen) {
        // Left or relaunched while the task was minting / fetching the deck:
        // touch neither the client nor the newer match's state.
        if (launchGenRef.current !== gen) throw cancelled();
        const role = opts.role ?? "player";
        dispatch({ type: "connectStarted", role, vsBot: Boolean(opts.createOptions?.bot) });
        connectRoleRef.current = role;
        // A new match: forget the last match's server (unset → the client's own).
        serverUrlRef.current = opts.serverUrl ?? null;
        if (opts.serverUrl) setLastServerUrl(opts.serverUrl);
        wireHandlers();
        const info = await client.connect(opts);
        if (launchGenRef.current !== gen) throw abandon();
        seatRef.current = info.seat;
        flushSync(() => {
          dispatch({ type: "joined", matchId: info.matchId, seat: info.seat, canReconnect: role === "player" });
        });
        const tok = client.getReconnectionToken();
        if (tok) persistToken(tok, info.matchId);
      },
      async queueRanked(opts, gen) {
        if (launchGenRef.current !== gen) throw cancelled();
        dispatch({ type: "queueStarted" });
        serverUrlRef.current = opts.serverUrl ?? null;
        if (opts.serverUrl) setLastServerUrl(opts.serverUrl);
        wireHandlers();
        try {
          const info = await client.queueRanked(opts);
          if (launchGenRef.current !== gen) throw abandon();
          seatRef.current = info.seat;
          flushSync(() => {
            dispatch({ type: "joined", matchId: info.matchId, seat: info.seat, canReconnect: true, queueing: false });
          });
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, info.matchId);
        } catch (e) {
          dispatch({ type: "queueCancelled" });
          throw e;
        }
      },
      async cancelQueue() {
        await client.cancelQueue();
        dispatch({ type: "queueCancelled" });
      },
      async reconnect() {
        dispatch({ type: "reconnectStarted" });
        wireHandlers();
        try {
          const info = await client.reconnect({
            serverUrl: serverUrlRef.current ?? undefined,
          });
          seatRef.current = info.seat;
          dispatch({
            type: "joined",
            matchId: info.matchId,
            seat: info.seat,
            canReconnect: true,
            reconnecting: false,
            resuming: false,
          });
        } catch (e) {
          clearMatchResume();
          dispatch({
            type: "reconnectFailed",
            banner: isSeatReservationExpiredError(e)
              ? "You were away too long and your seat was released."
              : e instanceof Error
                ? e.message
                : "Reconnect failed",
          });
          throw e;
        }
      },
      async tryResumeFromStorage() {
        const blob = loadMatchResume();
        if (!blob || blob.mode !== "duel") {
          dispatch({ type: "resumeEnded" });
          return false;
        }
        // Past Colyseus grace → token is dead; skip instead of surfacing
        // "seat reservation expired" on every late refresh.
        if (!isResumeWithinGrace(blob.savedAt)) {
          clearMatchResume();
          dispatch({ type: "resumeEnded" });
          return false;
        }
        dispatch({ type: "resumeStarted" });
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
            dispatch({ type: "joined", matchId: info.matchId, seat: info.seat, canReconnect: true, resuming: false });
          });
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, info.matchId);
          return true;
        } catch (e) {
          clearMatchResume();
          const msg = e instanceof Error ? e.message : "Resume failed";
          // Expired grace tokens are expected after idle / free-tier sleep —
          // don't leave a scary banner on the lobby redirect path.
          dispatch({ type: "resumeEnded", banner: isSeatReservationExpiredError(msg) ? undefined : msg });
          return false;
        }
      },
      sendIntent(intent) {
        try {
          client.sendIntent(intent);
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Send failed" });
        }
      },
      concede() {
        try {
          client.concede();
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Concede failed" });
        }
      },
      startMatch(next, task) {
        const gen = ++launchGenRef.current;
        launchingRef.current = true;
        dispatch({ type: "launchStarted" });
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
            dispatch({ type: "launchFailed", banner: e instanceof Error ? e.message : "Connect failed" });
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
        dispatch({ type: "setError", message: null });
      },
    };
    return actions;
  }, [store]);

  const value = useMemo<DuelSession>(
    () => ({
      ...actions,
      launch,
      launching,
      connected: match.connected,
      takenOver: match.takenOver,
      queueing: match.queueing,
      canReconnect: match.canReconnect,
      resuming: match.resuming,
      reconnecting: match.reconnecting,
      matchId: match.matchId,
      seat: match.seat,
      role: match.role,
      view: match.view,
      players: match.players,
      ranked: match.ranked,
      firstSeatPickedBy: match.firstSeatPickedBy,
      brief: match.brief,
      vsBot: match.vsBot,
      battleLog: match.battleLog,
      errorBanner: match.errorBanner,
      matchOver: match.matchOver,
      timer: match.timer,
      chat: match.chat,
      undo: match.undo,
      awayUntil: match.awayUntil,
      seatSkins: match.seatSkins,
      rematch: match.rematch,
      rating,
      lastServerUrl,
    }),
    [actions, match, launch, launching, rating, lastServerUrl],
  );

  useEffect(() => {
    const blob = loadMatchResume();
    if (blob?.mode !== "duel") {
      store.dispatch({ type: "resumeEnded" });
      return;
    }
    void actions.tryResumeFromStorage();
  }, [actions, store]);

  // Phones suspend the page (and often its socket) while another app is in
  // front. Keep the resume blob's clock at "last seen alive" so a discarded tab
  // can still reclaim its seat on reload, and on return reclaim at once instead
  // of waiting for a tap on the Reconnect banner.
  useEffect(() => {
    let checking = false;
    async function recoverIfDropped() {
      const s = store.getSnapshot();
      if (checking || s.role !== "player" || !s.canReconnect || !s.matchId || s.matchOver) return;
      const client = actions.client;
      if (client.isReconnecting || !client.getReconnectionToken()) return;
      checking = true;
      try {
        if (await client.isAlive()) return;
        // The SDK may have noticed the close while we waited; let it finish.
        if (client.isReconnecting) return;
        await actions.reconnect();
      } catch {
        /* reconnect() already set the banner */
      } finally {
        checking = false;
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void recoverIfDropped();
      else if (store.getSnapshot().connected) touchMatchResume();
    };
    const onPageHide = () => {
      if (store.getSnapshot().connected) touchMatchResume();
    };
    const onResume = () => void recoverIfDropped();
    const heartbeat = window.setInterval(() => {
      if (store.getSnapshot().connected) touchMatchResume();
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
  }, [actions, store]);

  return (
    <MatchStoreContext.Provider value={store}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </MatchStoreContext.Provider>
  );
}

export function useDuelSession(): DuelSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDuelSession outside provider");
  return ctx;
}
