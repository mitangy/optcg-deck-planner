import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import {
  narrateEvents,
  type BattleLogEntry,
} from "../board/battleLog";
import {
  initSeatArtPrefsFromStorage,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
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
  seat: Seat;
  view: PlayerView | null;
  matchOver: MatchOverMessage["result"] | null;
  error: string | null;
  connected: boolean;
  battleLog: BattleLogEntry[];
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
 * Park live hotseat sockets across React StrictMode remounts so we do not
 * soft-disconnect + reclaim (which rotates Colyseus reconnection tokens).
 * A deferred teardown still runs if the page truly leaves hotseat.
 */
type ParkedHotseat = {
  bags: [SeatBag, SeatBag];
  matchId: string;
  activeSeat: Seat;
  timer: ReturnType<typeof setTimeout> | null;
};
let parkedHotseat: ParkedHotseat | null = null;

function clearParkedTeardown() {
  if (parkedHotseat?.timer) {
    clearTimeout(parkedHotseat.timer);
    parkedHotseat.timer = null;
  }
}

function disposeParked(consented: boolean) {
  clearParkedTeardown();
  const bags = parkedHotseat?.bags;
  parkedHotseat = null;
  if (!bags) return;
  for (const b of bags) void b.client.disconnect(consented);
}

/**
 * One browser, two seats — pass the device between turns.
 * Refresh auto-reconnects both seats from the sessionStorage resume blob.
 */
export function HotseatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navFromRoute = (location.state ?? null) as HotseatNavState | null;
  // Capture resume intent once on mount. Refresh keeps history.state, so we
  // prefer a sessionStorage blob over treating that state as a fresh start.
  const resumeOnMount = useRef(
    (() => {
      const existing = loadMatchResume();
      return existing?.mode === "hotseat" ? existing : null;
    })(),
  );
  const resumeHotseat = resumeOnMount.current;

  const navRef = useRef<HotseatNavState | null>(
    resumeHotseat ? navFromResume(resumeHotseat) : navFromRoute,
  );
  // Fresh lobby navigation (blob cleared before navigate) updates nav once.
  if (navFromRoute && !resumeHotseat) navRef.current = navFromRoute;
  const nav = navRef.current;

  const [activeSeat, setActiveSeat] = useState<Seat>(resumeHotseat?.activeSeat ?? 0);
  const [matchId, setMatchId] = useState<string | null>(resumeHotseat?.roomId ?? null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [resuming, setResuming] = useState(Boolean(resumeHotseat));
  const bags = useRef<[SeatBag | null, SeatBag | null]>([null, null]);
  const [, bump] = useState(0);
  const bootGen = useRef(0);
  /** When true, skip resume persist + socket park so Leave / Back can exit. */
  const leavingRef = useRef(false);
  const activeSeatRef = useRef(activeSeat);
  activeSeatRef.current = activeSeat;
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;

  const title = useMemo(() => nav?.deckName ?? "Hotseat", [nav?.deckName]);

  function persistResume() {
    if (leavingRef.current || !nav) return;
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

    clearParkedTeardown();

    const gen = ++bootGen.current;
    let cancelled = false;
    const clients: DuelClient[] = [];

    const alive = () => !cancelled && gen === bootGen.current;

    function bindBagHandlers(bag: SeatBag) {
      bag.client.setHandlers({
        onWelcome: ({ matchId: id, view }) => {
          // Always stash view so StrictMode park/reclaim keeps boards even
          // when this mount was already cancelled.
          bag.view = view;
          bag.connected = true;
          if (!alive()) return;
          setMatchId(id);
          matchIdRef.current = id;
          bump((n) => n + 1);
          persistResume();
        },
        onView: (view) => {
          bag.view = view;
          if (!alive()) return;
          bump((n) => n + 1);
        },
        onEvents: (events) => {
          const turn = bag.view?.turnNumber ?? 1;
          const lines = narrateEvents(events, {
            youSeat: bag.seat,
            turnNumber: turn,
          });
          if (lines.length) bag.battleLog = [...bag.battleLog, ...lines];
          if (!alive()) return;
          bump((n) => n + 1);
        },
        onMatchOver: (msg) => {
          bag.matchOver = msg.result;
          if (!alive()) return;
          clearMatchResume();
          bump((n) => n + 1);
        },
        onError: (err) => {
          bag.error = `${err.code}: ${err.message}`;
          if (!alive()) return;
          bump((n) => n + 1);
        },
        onDisconnect: () => {
          bag.connected = false;
          if (!alive()) return;
          bump((n) => n + 1);
        },
        onReconnectionToken: () => {
          if (!alive()) return;
          persistResume();
        },
      });
    }

    async function waitViews(bag0: SeatBag, bag1: SeatBag, ms = 15000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && (!bag0.view || !bag1.view)) {
        if (!alive()) return false;
        await new Promise((r) => setTimeout(r, 50));
      }
      return Boolean(bag0.view && bag1.view);
    }

    // Reclaim sockets parked by StrictMode remount — avoids token rotation.
    // Keep bags even when views are still in flight (welcome after cancel);
    // disposing them forced a soft-leave that Colyseus rejects when the room
    // is younger than ~5s, which left hotseat stuck until the 25s watchdog.
    if (parkedHotseat?.matchId && parkedHotseat.bags[0] && parkedHotseat.bags[1]) {
      const parked = parkedHotseat;
      parkedHotseat = null;
      bags.current = parked.bags;
      setMatchId(parked.matchId);
      matchIdRef.current = parked.matchId;
      setActiveSeat(parked.activeSeat);
      activeSeatRef.current = parked.activeSeat;
      setResuming(true);
      for (const bag of parked.bags) {
        clients.push(bag.client);
        bindBagHandlers(bag);
      }
      void (async () => {
        if (parked.bags[0].view && parked.bags[1].view) {
          if (!alive()) return;
          setResuming(false);
          setReady(true);
          return;
        }
        const ok = await waitViews(parked.bags[0], parked.bags[1]);
        if (!alive()) return;
        if (!ok) {
          // Sockets are dead / welcomes lost — tear down consented so seats
          // free immediately, then fall through is impossible; surface error.
          for (const bag of parked.bags) void bag.client.disconnect(true);
          bags.current = [null, null];
          clearMatchResume();
          setResuming(false);
          setBootError(
            "Hotseat reconnected but never received board views — try again",
          );
          return;
        }
        setResuming(false);
        setReady(true);
      })();
      return () => {
        cancelled = true;
        if (leavingRef.current) {
          matchIdRef.current = null;
          bags.current = [null, null];
          disposeParked(true);
          for (const c of clients) void c.disconnect(true);
          return;
        }
        const [b0, b1] = bags.current;
        if (b0 && b1 && matchIdRef.current) {
          parkedHotseat = {
            bags: [b0, b1],
            matchId: matchIdRef.current,
            activeSeat: activeSeatRef.current,
            timer: setTimeout(() => disposeParked(false), 500),
          };
        } else {
          for (const c of clients) void c.disconnect(true);
        }
      };
    }

    function wireBag(client: DuelClient, bag: SeatBag) {
      void client;
      bindBagHandlers(bag);
    }

    async function boot() {
      try {
        // Prefer the mount-time resume blob even when history.state is present
        // (browser refresh keeps location.state on the history entry).
        const shouldResume = resumeHotseat;

        if (shouldResume) {
          setResuming(true);
          const c0 = new DuelClient();
          const c1 = new DuelClient();
          clients.push(c0, c1);
          const bag0: SeatBag = {
            client: c0,
            seat: 0,
            view: null,
            matchOver: null,
            error: null,
            connected: false,
            battleLog: [],
          };
          const bag1: SeatBag = {
            client: c1,
            seat: 1,
            view: null,
            matchOver: null,
            error: null,
            connected: false,
            battleLog: [],
          };
          bags.current = [bag0, bag1];
          wireBag(c0, bag0);
          wireBag(c1, bag1);

          // Brief pause so the server's onDrop → allowReconnection is armed
          // after a hard refresh (WS drop). Reclaim seats one at a time.
          await new Promise((r) => setTimeout(r, 150));
          if (!alive()) return;
          const w0 = await c0.reconnect({
            serverUrl: shouldResume.serverUrl,
            reconnectionToken: shouldResume.seats[0].reconnectionToken,
          });
          if (!alive()) return;
          const w1 = await c1.reconnect({
            serverUrl: shouldResume.serverUrl,
            reconnectionToken: shouldResume.seats[1].reconnectionToken,
          });
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
          seat: 0,
          view: null,
          matchOver: null,
          error: null,
          connected: false,
          battleLog: [],
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
          createOptions: { players: [wire, wire], autoSkipMulligan: false },
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
          seat: 1,
          view: null,
          matchOver: null,
          error: null,
          connected: false,
          battleLog: [],
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
        const [p0, p1] = bags.current;
        if (p0 && p1 && matchIdRef.current) {
          parkedHotseat = {
            bags: [p0, p1],
            matchId: matchIdRef.current,
            activeSeat: activeSeatRef.current,
            timer: null,
          };
        }
        setResuming(false);
        setReady(true);
      } catch (e) {
        if (alive()) {
          clearMatchResume();
          setResuming(false);
          setBootError(e instanceof Error ? e.message : "Hotseat failed");
        }
      }
    }

    // Hard ceiling so a hung mint/matchmake cannot leave the UI on Starting forever.
    const bootWatchdog = window.setTimeout(() => {
      if (!alive()) return;
      clearMatchResume();
      setResuming(false);
      setBootError("Hotseat startup timed out — check the game server and try again");
    }, 25000);

    // Defer connect past React StrictMode's immediate remount so the first
    // mount cancels before opening sockets (avoids soft-leave on a <5s room).
    const bootDelay = window.setTimeout(() => {
      void boot().finally(() => {
        window.clearTimeout(bootWatchdog);
      });
    }, 75);

    return () => {
      cancelled = true;
      window.clearTimeout(bootDelay);
      window.clearTimeout(bootWatchdog);
      // Intentional Leave: tear down immediately and do not re-park / re-resume.
      if (leavingRef.current) {
        matchIdRef.current = null;
        bags.current = [null, null];
        disposeParked(true);
        for (const c of clients) void c.disconnect(true);
        return;
      }
      // Park sockets briefly so StrictMode remount can reclaim them without
      // rotating reconnection tokens. Real navigation/unload tears down after.
      const [b0, b1] = bags.current;
      if (b0 && b1 && matchIdRef.current) {
        parkedHotseat = {
          bags: [b0, b1],
          matchId: matchIdRef.current,
          activeSeat: activeSeatRef.current,
          timer: setTimeout(() => disposeParked(false), 500),
        };
      } else {
        // Consented leave frees seats immediately (soft-leave on a brand-new
        // room fails Colyseus's min-uptime reconnect gate and blocks remount).
        for (const c of clients) void c.disconnect(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    // Shared in-process maps — no cosmetics network relay for hotseat.
    // Seed once when the match becomes ready; do not re-seed on seat switch
    // or divergent per-seat alt picks would be wiped.
    setCosmeticsPublisher(null);
    initSeatArtPrefsFromStorage(0);
    initSeatArtPrefsFromStorage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    persistResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeat, ready]);

  useEffect(() => {
    return () => {
      if (!parkedHotseat) {
        setCosmeticsPublisher(null);
        resetAllSeatArtPrefs();
      }
    };
  }, []);

  if (!nav) return null;

  const bag = bags.current[activeSeat];
  const other: Seat = activeSeat === 0 ? 1 : 0;

  function sendIntent(intent: Intent) {
    bag?.client.sendIntent(intent);
  }

  async function leave() {
    leavingRef.current = true;
    clearMatchResume();
    matchIdRef.current = null;
    disposeParked(true);
    const toClose = bags.current;
    bags.current = [null, null];
    await Promise.allSettled(
      toClose.map((b) => (b ? b.client.disconnect(true) : Promise.resolve())),
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
        <div className="hotseat-bar">
          <span>{resuming ? `Reconnecting (${title})…` : `Starting hotseat (${title})…`}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void leave()}>
            Leave
          </button>
        </div>
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
          {bag.view.phase === "mulligan"
            ? bag.view.you.mulliganDone
              ? " · mulligan done — pass device if needed"
              : " · mulligan: keep or redraw"
            : ""}
        </span>
        <div className="hotseat-bar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setActiveSeat(other)}>
            Pass device → seat {other}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void leave()}>
            Leave match
          </button>
        </div>
      </div>
      <DuelBoard
        view={bag.view}
        seat={activeSeat}
        matchId={matchId}
        errorBanner={bag.error}
        matchOver={bag.matchOver}
        battleLog={bag.battleLog}
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
