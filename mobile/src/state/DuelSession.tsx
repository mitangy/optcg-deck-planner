import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { DuelClient } from "../net/duelClient";
import type {
  Intent,
  MatchOverMessage,
  PlayerView,
  Seat,
} from "../net/protocol";

type DuelSession = {
  client: DuelClient;
  connected: boolean;
  queueing: boolean;
  canReconnect: boolean;
  matchId: string | null;
  seat: Seat | null;
  view: PlayerView | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  rating: number | null;
  connect: (opts: {
    serverUrl?: string;
    devUserId?: string;
    gameToken?: string;
    secret?: string;
    roomId?: string;
    preferredSeat?: Seat;
  }) => Promise<void>;
  queueRanked: (opts: {
    serverUrl?: string;
    devUserId?: string;
    gameToken?: string;
    secret?: string;
  }) => Promise<void>;
  cancelQueue: () => Promise<void>;
  reconnect: () => Promise<void>;
  sendIntent: (intent: Intent) => void;
  concede: () => void;
  leave: () => Promise<void>;
  clearError: () => void;
  setRating: (n: number | null) => void;
};

const Ctx = createContext<DuelSession | null>(null);

export function DuelSessionProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef(new DuelClient());
  const [connected, setConnected] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [matchOver, setMatchOver] = useState<MatchOverMessage["result"] | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  const value = useMemo<DuelSession>(() => {
    const client = clientRef.current;

    function wireHandlers() {
      client.setHandlers({
        onWelcome: ({ matchId: id, seat: s, view: v }) => {
          setMatchId(id);
          setSeat(s);
          setView(v);
          setConnected(true);
          setCanReconnect(true);
          setQueueing(false);
        },
        onView: (v) => setView(v),
        onError: (err) => setErrorBanner(`${err.code}: ${err.message}`),
        onMatchOver: (msg) => {
          setMatchOver(msg.result);
          setCanReconnect(false);
        },
        onDisconnect: () => {
          setConnected(false);
          setQueueing(false);
        },
        onQueued: () => setQueueing(true),
      });
    }

    return {
      client,
      connected,
      queueing,
      canReconnect,
      matchId,
      seat,
      view,
      errorBanner,
      matchOver,
      rating,
      setRating,
      async connect(opts) {
        setErrorBanner(null);
        setMatchOver(null);
        setView(null);
        setQueueing(false);
        wireHandlers();
        const info = await client.connect(opts);
        setMatchId(info.matchId);
        setSeat(info.seat);
        setConnected(true);
        setCanReconnect(true);
      },
      async queueRanked(opts) {
        setErrorBanner(null);
        setMatchOver(null);
        setView(null);
        setQueueing(true);
        wireHandlers();
        try {
          const info = await client.queueRanked(opts);
          setMatchId(info.matchId);
          setSeat(info.seat);
          setConnected(true);
          setCanReconnect(true);
          setQueueing(false);
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
        const info = await client.reconnect();
        setMatchId(info.matchId);
        setSeat(info.seat);
        setConnected(true);
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
        await client.disconnect();
        setConnected(false);
        setQueueing(false);
        setCanReconnect(false);
        setMatchId(null);
        setSeat(null);
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
    matchId,
    seat,
    view,
    errorBanner,
    matchOver,
    rating,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDuelSession(): DuelSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDuelSession outside provider");
  return ctx;
}
