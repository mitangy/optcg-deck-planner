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
  DiceAction,
  DiceResult,
  DiceStateMessage,
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
  takeover?: boolean;
  ownerToken?: string;
  createOptions?: {
    ranked?: boolean;
    tournamentTicket?: string;
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

export type MatchLaunch = {
  status: string;
  leaderId: string | null;
  invite: boolean;
  friends?: boolean;
};

type DuelSession = {
  client: DuelClient;
  launch: MatchLaunch | null;
  launching: boolean;
  startMatch: (launch: MatchLaunch, task: (launchGen: number) => Promise<void>) => void;
  connected: boolean;
  takenOver: boolean;
  takeOver: (roomId: string, seat: Seat, mintToken?: () => Promise<string>) => void;
  queueing: boolean;
  canReconnect: boolean;
  resuming: boolean;
  reconnecting: boolean;
  matchId: string | null;
  seat: Seat | null;
  role: "player" | "spectator";
  view: PlayerView | null;
  players: SeatPlayers | null;
  ranked: boolean | null;
  firstSeatPickedBy: Seat | null | undefined;
  firstSeatDice: DiceResult | null;
  dice: DiceStateMessage | null;
  sendDice: (action: DiceAction) => void;
  brief: BriefTicketWire | null;
  vsBot: boolean;
  battleLog: BattleLogEntry[];
  clearBattleLog: () => void;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  timer: TimerMessage | null;
  chat: ChatLine[];
  sendChat: (text: string) => void;
  sendHandOrder: (ids: string[]) => void;
  undo: UndoState | null;
  awayUntil: [number | null, number | null];
  seatSkins: [SeatSkin | null, SeatSkin | null];
  rematch: RematchState | null;
  sendRematch: (action: RematchAction, deck?: PlayerDeckWire) => void;
  sendUndo: (action: UndoAction, opts?: UndoRequestOptions) => void;
  rating: number | null;
  lastServerUrl: string | null;
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
  | "sendDice"
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
  const storeRef = useRef<MatchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createMatchStore("online", { resuming: loadMatchResume()?.mode === "duel" });
  }
  const store = storeRef.current;
  const serverUrlRef = useRef<string | null>(null);
  const skinSentAsPathRef = useRef(false);
  const seatRef = useRef<Seat | null>(null);
  const [launch, setLaunch] = useState<MatchLaunch | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchGenRef = useRef(0);
  const launchingRef = useRef(false);
  const connectRoleRef = useRef<"player" | "spectator">("player");
  const [rating, setRating] = useState<number | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  const match = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const actions = useMemo(() => {
    const client = clientRef.current;
    const { dispatch } = store;

    function persistToken(token: string, roomId: string) {
      const s = seatRef.current;
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
        onDiceState: (state) => dispatch({ type: "diceState", state }),
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
      sendDice(action) {
        try {
          client.sendDice(action);
        } catch (e) {
          dispatch({ type: "setError", message: e instanceof Error ? e.message : "Dice roll failed" });
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
        if (launchGenRef.current !== gen) throw cancelled();
        const role = opts.role ?? "player";
        dispatch({ type: "connectStarted", role, vsBot: Boolean(opts.createOptions?.bot) });
        connectRoleRef.current = role;
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
      firstSeatDice: match.firstSeatDice,
      dice: match.dice,
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
