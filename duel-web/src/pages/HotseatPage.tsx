import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import { mintGuestGameToken } from "../net/api";
import { DuelClient } from "../net/duelClient";
import {
  clearMatchResume,
  loadMatchResume,
  saveMatchResume,
  type HotseatResumeBlob,
} from "../net/matchResume";
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

function navFromResume(blob: HotseatResumeBlob): HotseatNavState {
  return {
    serverUrl: blob.serverUrl,
    secret: blob.secret,
    userKey: blob.userKey,
    useToken: blob.useToken,
    deckWire: blob.deckWire,
    deckName: blob.deckName,
  };
}

/**
 * One browser, two seats — pass the device between turns.
 * Refresh auto-reconnects both seats from the sessionStorage resume blob.
 */
export function HotseatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navFromRoute = (location.state ?? null) as HotseatNavState | null;
  const existingResume = loadMatchResume();
  const resumeHotseat =
    !navFromRoute && existingResume?.mode === "hotseat" ? existingResume : null;

  const navRef = useRef<HotseatNavState | null>(
    navFromRoute ?? (resumeHotseat ? navFromResume(resumeHotseat) : null),
  );
  if (navFromRoute) navRef.current = navFromRoute;
  const nav = navFromRoute ?? navRef.current;

  const [activeSeat, setActiveSeat] = useState<Seat>(resumeHotseat?.activeSeat ?? 0);
  const [matchId, setMatchId] = useState<string | null>(resumeHotseat?.roomId ?? null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [resuming, setResuming] = useState(Boolean(resumeHotseat));
  const bags = useRef<[SeatBag | null, SeatBag | null]>([null, null]);
  const [, bump] = useState(0);
  const bootGen = useRef(0);
  const activeSeatRef = useRef(activeSeat);
  activeSeatRef.current = activeSeat;
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;

  const title = useMemo(() => nav?.deckName ?? "Hotseat", [nav?.deckName]);

  function persistResume() {
    if (!nav) return;
    const [b0, b1] = bags.current;
    const t0 = b0?.client.getReconnectionToken();
    const t1 = b1?.client.getReconnectionToken();
    const room = matchIdRef.current ?? b0?.client.roomId;
    if (!t0 || !t1 || !room) return;
    saveMatchResume({
      mode: "hotseat",
      serverUrl: nav.serverUrl,
      roomId: room,
      secret: nav.secret,
      userKey: nav.userKey,
      useToken: nav.useToken,
      deckWire: nav.deckWire,
      deckName: nav.deckName,
      seats: [{ reconnectionToken: t0 }, { reconnectionToken: t1 }],
      activeSeat: activeSeatRef.current,
      savedAt: Date.now(),
    });
  }

  useEffect(() => {
    if (!nav) {
      navigate("/", { replace: true });
      return;
    }

    const gen = ++bootGen.current;
    let cancelled = false;
    const clients: DuelClient[] = [];

    const alive = () => !cancelled && gen === bootGen.current;

    function wireBag(client: DuelClient, bag: SeatBag) {
      client.setHandlers({
        onWelcome: ({ matchId: id, view }) => {
          if (!alive()) return;
          setMatchId(id);
          matchIdRef.current = id;
          bag.view = view;
          bag.connected = true;
          bump((n) => n + 1);
          persistResume();
        },
        onView: (view) => {
          if (!alive()) return;
          bag.view = view;
          bump((n) => n + 1);
        },
        onMatchOver: (msg) => {
          if (!alive()) return;
          bag.matchOver = msg.result;
          clearMatchResume();
          bump((n) => n + 1);
        },
        onError: (err) => {
          if (!alive()) return;
          bag.error = `${err.code}: ${err.message}`;
          bump((n) => n + 1);
        },
        onDisconnect: () => {
          if (!alive()) return;
          bag.connected = false;
          bump((n) => n + 1);
        },
        onReconnectionToken: () => {
          if (!alive()) return;
          persistResume();
        },
      });
    }

    async function waitViews(bag0: SeatBag, bag1: SeatBag) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline && (!bag0.view || !bag1.view)) {
        if (!alive()) return false;
        await new Promise((r) => setTimeout(r, 50));
      }
      return Boolean(bag0.view && bag1.view);
    }

    async function boot() {
      try {
        const shouldResume =
          !navFromRoute && loadMatchResume()?.mode === "hotseat"
            ? (loadMatchResume() as HotseatResumeBlob)
            : null;

        if (shouldResume) {
          setResuming(true);
          const c0 = new DuelClient();
          const c1 = new DuelClient();
          clients.push(c0, c1);
          const bag0: SeatBag = {
            client: c0,
            view: null,
            matchOver: null,
            error: null,
            connected: false,
          };
          const bag1: SeatBag = {
            client: c1,
            view: null,
            matchOver: null,
            error: null,
            connected: false,
          };
          bags.current = [bag0, bag1];
          wireBag(c0, bag0);
          wireBag(c1, bag1);

          const [w0, w1] = await Promise.all([
            c0.reconnect({
              serverUrl: shouldResume.serverUrl,
              reconnectionToken: shouldResume.seats[0].reconnectionToken,
            }),
            c1.reconnect({
              serverUrl: shouldResume.serverUrl,
              reconnectionToken: shouldResume.seats[1].reconnectionToken,
            }),
          ]);
          if (!alive()) return;
          if (w0.matchId !== w1.matchId) {
            throw new Error("Hotseat seats reconnected to different rooms");
          }
          setMatchId(w0.matchId);
          matchIdRef.current = w0.matchId;
          if (shouldResume.activeSeat === 0 || shouldResume.activeSeat === 1) {
            setActiveSeat(shouldResume.activeSeat);
            activeSeatRef.current = shouldResume.activeSeat;
          }
          persistResume();
          if (!(await waitViews(bag0, bag1))) {
            if (!alive()) return;
            throw new Error("Hotseat reconnected but never received board views");
          }
          if (!alive()) return;
          setResuming(false);
          setReady(true);
          return;
        }

        // Fresh match from lobby navigation.
        clearMatchResume();
        const wire = nav!.deckWire;

        async function auth(suffix: string) {
          if (!nav!.useToken) {
            return {
              serverUrl: nav!.serverUrl,
              devUserId: `${nav!.userKey}-${suffix}`,
              secret: nav!.secret,
            };
          }
          // Guest mint is always available and keeps seat identities stable
          // across refreshes via the browser guest id / userKey prefix.
          const minted = await mintGuestGameToken(`${nav!.userKey}-${suffix}`);
          return {
            serverUrl: nav!.serverUrl,
            gameToken: minted.token,
            secret: nav!.secret,
          };
        }

        const auth0 = await auth("a");
        if (!alive()) return;

        const c0 = new DuelClient();
        clients.push(c0);
        const bag0: SeatBag = {
          client: c0,
          view: null,
          matchOver: null,
          error: null,
          connected: false,
        };
        if (!alive()) {
          void c0.disconnect(false);
          return;
        }
        bags.current[0] = bag0;
        wireBag(c0, bag0);

        const info = await c0.connect({
          ...auth0,
          preferredSeat: 0,
          deck: wire,
          createOptions: { players: [wire, wire] },
        });
        if (!alive()) return;
        setMatchId(info.matchId);
        matchIdRef.current = info.matchId;

        const auth1 = await auth("b");
        if (!alive()) return;

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
        wireBag(c1, bag1);

        await c1.connect({
          ...auth1,
          roomId: info.matchId,
          preferredSeat: 1,
          deck: wire,
        });
        if (!alive()) return;

        persistResume();
        if (!(await waitViews(bag0, bag1))) {
          if (!alive()) return;
          throw new Error("Hotseat connected but never received board views");
        }
        if (!alive()) return;
        setReady(true);
      } catch (e) {
        if (alive()) {
          clearMatchResume();
          setResuming(false);
          setBootError(e instanceof Error ? e.message : "Hotseat failed");
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      // Soft leave so StrictMode remount / refresh can still reconnect.
      for (const c of clients) void c.disconnect(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, navigate, navFromRoute]);

  useEffect(() => {
    if (!ready) return;
    persistResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeat, ready]);

  if (!nav) return null;

  const bag = bags.current[activeSeat];
  const other: Seat = activeSeat === 0 ? 1 : 0;

  function sendIntent(intent: Intent) {
    bag?.client.sendIntent(intent);
  }

  async function leave() {
    clearMatchResume();
    await Promise.allSettled(
      bags.current.map((b) => (b ? b.client.disconnect(true) : Promise.resolve())),
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

  if (!ready || !bag?.view) {
    return (
      <div className="duel-root">
        <div className="loading arena-loading">
          {resuming ? `Reconnecting both seats (${title})…` : `Starting hotseat (${title})…`}
        </div>
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
