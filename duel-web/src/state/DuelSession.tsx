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
import {
  clearMatchResume,
  isResumeWithinGrace,
  loadMatchResume,
  saveMatchResume,
} from "../net/matchResume";
import type {
  Intent,
  MatchOverMessage,
  PlayerView,
  Seat,
} from "../net/protocol";
import {
  initSeatArtPrefsFromStorage,
  replaceSeatArtPrefs,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
import {
  narrateEvents,
  type BattleLogEntry,
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
  createOptions?: {
    players?: [
      { leaderId: string; deck: string[] },
      { leaderId: string; deck: string[] },
    ];
  };
};

type DuelSession = {
  client: DuelClient;
  connected: boolean;
  queueing: boolean;
  canReconnect: boolean;
  /** True while a sessionStorage resume is in flight (blocks lobby redirect). */
  resuming: boolean;
  matchId: string | null;
  seat: Seat | null;
  role: "player" | "spectator";
  view: PlayerView | null;
  battleLog: BattleLogEntry[];
  clearBattleLog: () => void;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  rating: number | null;
  lastServerUrl: string | null;
  connect: (opts: ConnectOpts) => Promise<void>;
  queueRanked: (
    opts: Pick<ConnectOpts, "serverUrl" | "devUserId" | "gameToken" | "secret" | "deck">,
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

const Ctx = createContext<DuelSession | null>(null);

export function DuelSessionProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef(new DuelClient());
  const serverUrlRef = useRef<string | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const [connected, setConnected] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [resuming, setResuming] = useState(() => loadMatchResume()?.mode === "duel");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [role, setRole] = useState<"player" | "spectator">("player");
  const [view, setView] = useState<PlayerView | null>(null);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const viewRef = useRef<PlayerView | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [matchOver, setMatchOver] = useState<MatchOverMessage["result"] | null>(null);
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
        onWelcome: ({ matchId: id, seat: s, view: v, role: r }) => {
          seatRef.current = s;
          setMatchId(id);
          setSeat(s);
          setRole(r);
          viewRef.current = v;
          setView(v);
          setBattleLog([]);
          setConnected(true);
          setCanReconnect(r === "player");
          setQueueing(false);
          setResuming(false);
          if (r === "player" && (s === 0 || s === 1)) {
            setCosmeticsPublisher((publishSeat, prefs) => {
              if (publishSeat !== seatRef.current) return;
              client.sendCosmetics(prefs);
            });
            initSeatArtPrefsFromStorage(s);
          }
          const tok = client.getReconnectionToken();
          if (tok) persistToken(tok, id);
        },
        onView: (v) => {
          viewRef.current = v;
          setView(v);
        },
        onEvents: (events) => {
          const turn = viewRef.current?.turnNumber ?? 1;
          const youSeat = seatRef.current;
          const lines = narrateEvents(events, { youSeat, turnNumber: turn });
          if (lines.length) setBattleLog((prev) => [...prev, ...lines]);
        },
        onCosmetics: (msg) => {
          replaceSeatArtPrefs(msg.seat, msg.artPrefs);
        },
        onError: (err) => setErrorBanner(`${err.code}: ${err.message}`),
        onMatchOver: (msg) => {
          setMatchOver(msg.result);
          setCanReconnect(false);
          clearMatchResume();
        },
        onDisconnect: () => {
          setConnected(false);
          setQueueing(false);
        },
        onQueued: () => setQueueing(true),
        onReconnectionToken: (token, roomId) => persistToken(token, roomId),
      });
    }

    return {
      client,
      connected,
      queueing,
      canReconnect,
      resuming,
      matchId,
      seat,
      role,
      view,
      battleLog,
      clearBattleLog: () => setBattleLog([]),
      errorBanner,
      matchOver,
      rating,
      lastServerUrl,
      setRating,
      async connect(opts) {
        setErrorBanner(null);
        setMatchOver(null);
        setView(null);
        setQueueing(false);
        setResuming(false);
        setRole(opts.role ?? "player");
        if (opts.serverUrl) {
          serverUrlRef.current = opts.serverUrl;
          setLastServerUrl(opts.serverUrl);
        }
        wireHandlers();
        const info = await client.connect(opts);
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
      async queueRanked(opts) {
        setErrorBanner(null);
        setMatchOver(null);
        setView(null);
        setQueueing(true);
        setResuming(false);
        if (opts.serverUrl) {
          serverUrlRef.current = opts.serverUrl;
          setLastServerUrl(opts.serverUrl);
        }
        wireHandlers();
        try {
          const info = await client.queueRanked(opts);
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
        wireHandlers();
        const info = await client.reconnect({
          serverUrl: serverUrlRef.current ?? undefined,
        });
        seatRef.current = info.seat;
        setMatchId(info.matchId);
        setSeat(info.seat);
        setConnected(true);
        setCanReconnect(true);
        setResuming(false);
      },
      async tryResumeFromStorage() {
        const blob = loadMatchResume();
        if (!blob || blob.mode !== "duel") {
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
          setErrorBanner(e instanceof Error ? e.message : "Resume failed");
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
      async leave() {
        clearMatchResume();
        setCosmeticsPublisher(null);
        resetAllSeatArtPrefs();
        await client.disconnect(true);
        setConnected(false);
        setQueueing(false);
        setCanReconnect(false);
        setResuming(false);
        setMatchId(null);
        setSeat(null);
        seatRef.current = null;
        setRole("player");
        setView(null);
        setMatchOver(null);
      },
      clearError() {
        setErrorBanner(null);
      },
    };
  }, [
    connected,
    queueing,
    canReconnect,
    resuming,
    matchId,
    seat,
    role,
    view,
    battleLog,
    errorBanner,
    matchOver,
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDuelSession(): DuelSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDuelSession outside provider");
  return ctx;
}
