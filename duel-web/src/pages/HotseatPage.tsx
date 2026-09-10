import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import { mintDevGameToken } from "../net/api";
import { DuelClient } from "../net/duelClient";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";

type HotseatNavState = {
  serverUrl: string;
  secret?: string;
  userKey: string;
  useToken: boolean;
  deckWire: { leaderId: string; deck: string[] };
  deckName: string;
};

type SeatBag = {
  client: DuelClient;
  view: PlayerView | null;
  matchOver: MatchOverMessage["result"] | null;
  error: string | null;
  connected: boolean;
};

/** One browser, two seats — pass the device between turns. */
export function HotseatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (location.state ?? null) as HotseatNavState | null;

  const [activeSeat, setActiveSeat] = useState<Seat>(0);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const bags = useRef<[SeatBag | null, SeatBag | null]>([null, null]);
  const [, bump] = useState(0);

  const title = useMemo(() => nav?.deckName ?? "Hotseat", [nav?.deckName]);

  useEffect(() => {
    if (!nav) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;
    const clients: DuelClient[] = [];

    async function boot() {
      try {
        const wire = nav!.deckWire;

        async function auth(suffix: string) {
          if (!nav!.useToken) {
            return {
              serverUrl: nav!.serverUrl,
              devUserId: `${nav!.userKey}-${suffix}`,
              secret: nav!.secret,
            };
          }
          const minted = await mintDevGameToken(`${nav!.userKey}-${suffix}`);
          return {
            serverUrl: nav!.serverUrl,
            gameToken: minted.token,
            secret: nav!.secret,
          };
        }

        const auth0 = await auth("a");
        const c0 = new DuelClient();
        clients.push(c0);
        const bag0: SeatBag = {
          client: c0,
          view: null,
          matchOver: null,
          error: null,
          connected: false,
        };
        bags.current[0] = bag0;
        c0.setHandlers({
          onWelcome: ({ matchId: id, view }) => {
            setMatchId(id);
            bag0.view = view;
            bag0.connected = true;
            bump((n) => n + 1);
          },
          onView: (view) => {
            bag0.view = view;
            bump((n) => n + 1);
          },
          onMatchOver: (msg) => {
            bag0.matchOver = msg.result;
            bump((n) => n + 1);
          },
          onError: (err) => {
            bag0.error = `${err.code}: ${err.message}`;
            bump((n) => n + 1);
          },
          onDisconnect: () => {
            bag0.connected = false;
            bump((n) => n + 1);
          },
        });

        const info = await c0.connect({
          ...auth0,
          preferredSeat: 0,
          deck: wire,
          createOptions: { players: [wire, wire] },
        });
        if (cancelled) return;
        setMatchId(info.matchId);

        const auth1 = await auth("b");
        const c1 = new DuelClient();
        clients.push(c1);
        const bag1: SeatBag = {
          client: c1,
          view: null,
          matchOver: null,
          error: null,
          connected: false,
        };
        bags.current[1] = bag1;
        c1.setHandlers({
          onWelcome: ({ view }) => {
            bag1.view = view;
            bag1.connected = true;
            bump((n) => n + 1);
          },
          onView: (view) => {
            bag1.view = view;
            bump((n) => n + 1);
          },
          onMatchOver: (msg) => {
            bag1.matchOver = msg.result;
            bump((n) => n + 1);
          },
          onError: (err) => {
            bag1.error = `${err.code}: ${err.message}`;
            bump((n) => n + 1);
          },
          onDisconnect: () => {
            bag1.connected = false;
            bump((n) => n + 1);
          },
        });

        await c1.connect({
          ...auth1,
          roomId: info.matchId,
          preferredSeat: 1,
          deck: wire,
        });
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : "Hotseat failed");
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      for (const c of clients) void c.disconnect();
    };
  }, [nav, navigate]);

  if (!nav) return null;

  const bag = bags.current[activeSeat];
  const other: Seat = activeSeat === 0 ? 1 : 0;

  function sendIntent(intent: Intent) {
    bag?.client.sendIntent(intent);
  }

  async function leave() {
    await Promise.allSettled(
      bags.current.map((b) => (b ? b.client.disconnect() : Promise.resolve())),
    );
    navigate("/", { replace: true });
  }

  if (bootError) {
    return (
      <div className="duel-root">
        <p className="error-text" style={{ padding: 16 }}>
          {bootError}
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
          Back to lobby
        </button>
      </div>
    );
  }

  if (!ready || !bag) {
    return (
      <div className="duel-root">
        <div className="loading arena-loading">Starting hotseat ({title})…</div>
      </div>
    );
  }

  return (
    <div className="duel-root">
      <div className="hotseat-bar">
        <span>
          Hotseat · controlling seat {activeSeat} · {title}
        </span>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveSeat(other)}>
          Pass device → seat {other}
        </button>
      </div>
      <DuelBoard
        view={bag.view}
        seat={activeSeat}
        matchId={matchId}
        errorBanner={bag.error}
        matchOver={bag.matchOver}
        onSendIntent={sendIntent}
        onLeave={leave}
        onClearError={() => {
          if (bags.current[activeSeat]) bags.current[activeSeat]!.error = null;
          bump((n) => n + 1);
        }}
      />
    </div>
  );
}
