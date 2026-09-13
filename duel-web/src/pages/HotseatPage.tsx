import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { rewriteLoopbackToPageHost } from "../config";
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
import { hotseatGuestId, mintGuestGameToken } from "../net/api";
import { DuelClient } from "../net/duelClient";
import {
  clearMatchResume,
  isResumeWithinGrace,
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
  /** Optional tokens minted on the lobby (avoids cold-start race on this page). */
  seatTokens?: [string, string];
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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
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
  /** Bump to remount the boot effect for Retry (fresh match). */
  const [bootKey, setBootKey] = useState(0);
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
      serverUrl: rewriteLoopbackToPageHost(nav.serverUrl),
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
    // Only reclaim healthy (still connected) bags. Stale parked bags with
    // views but dead sockets used to mark ready and hang; disconnected bags
    // fall through to a fresh boot instead of waiting out the watchdog.
    if (parkedHotseat?.matchId && parkedHotseat.bags[0] && parkedHotseat.bags[1]) {
      const parked = parkedHotseat;
      parkedHotseat = null;
      const healthy = parked.bags[0].connected && parked.bags[1].connected;
      if (!healthy) {
        for (const bag of parked.bags) void bag.client.disconnect(true);
      } else {
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
          const ok = await waitViews(parked.bags[0], parked.bags[1], 8000);
          if (!alive()) return;
          if (!ok || !parked.bags[0].connected || !parked.bags[1].connected) {
            for (const bag of parked.bags) void bag.client.disconnect(true);
            bags.current = [null, null];
            clearMatchResume();
            setResuming(false);
            setBootError("Hotseat reconnected but lost the board — try again");
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
          if (b0 && b1 && matchIdRef.current && b0.connected && b1.connected) {
            parkedHotseat = {
              bags: [b0, b1],
              matchId: matchIdRef.current,
              activeSeat: activeSeatRef.current,
              timer: setTimeout(() => disposeParked(false), 2000),
            };
          } else {
            for (const c of clients) void c.disconnect(true);
          }
        };
      }
    }

    function wireBag(client: DuelClient, bag: SeatBag) {
      void client;
      bindBagHandlers(bag);
    }

    async function boot() {
      try {
        // Prefer the mount-time resume blob even when history.state is present
        // (browser refresh keeps location.state on the history entry).
        // Skip resume outside Colyseus grace — doomed "seat reservation expired"
        // attempts previously burned the watchdog before a fresh mint.
        const shouldResume =
          resumeHotseat && isResumeWithinGrace(resumeHotseat.savedAt)
            ? resumeHotseat
            : null;
        if (resumeHotseat && !shouldResume) {
          clearMatchResume();
          resumeOnMount.current = null;
          console.warn("[hotseat] resume blob past reconnect grace; starting fresh");
        }
        // Lobby / resume may bake localhost; rewrite when the SPA is on a
        // non-loopback host so mint + matchmake hit this machine's game server.
        const gsUrl = rewriteLoopbackToPageHost(nav!.serverUrl);

        if (shouldResume) {
          setResuming(true);
          const resumeUrl = rewriteLoopbackToPageHost(shouldResume.serverUrl);
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

          try {
            // Brief pause so the server's onDrop → allowReconnection is armed
            // after a hard refresh (WS drop). Reclaim seats one at a time.
            await new Promise((r) => setTimeout(r, 150));
            if (!alive()) return;
            // Keep resume attempts short so a dead token falls through quickly
            // to a fresh mint instead of eating the whole boot budget.
            const w0 = await withTimeout(
              c0.reconnect({
                serverUrl: resumeUrl,
                reconnectionToken: shouldResume.seats[0].reconnectionToken,
                attempts: 2,
              }),
              4000,
              "Hotseat seat 0 reconnect",
            );
            if (!alive()) return;
            const w1 = await withTimeout(
              c1.reconnect({
                serverUrl: resumeUrl,
                reconnectionToken: shouldResume.seats[1].reconnectionToken,
                attempts: 2,
              }),
              4000,
              "Hotseat seat 1 reconnect",
            );
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
            if (!(await waitViews(bag0, bag1, 8000))) {
              if (!alive()) return;
              throw new Error("Hotseat reconnected but never received board views");
            }
            if (!alive()) return;
            setResuming(false);
            setReady(true);
            return;
          } catch (resumeErr) {
            // Dead tokens / wrong host: drop resume and create a fresh match
            // instead of sitting on Starting until the watchdog.
            if (!alive()) return;
            for (const c of [c0, c1]) void c.disconnect(true);
            bags.current = [null, null];
            clearMatchResume();
            resumeOnMount.current = null;
            setResuming(false);
            console.warn(
              "[hotseat] resume failed, starting fresh",
              resumeErr instanceof Error ? resumeErr.message : resumeErr,
            );
          }
        }

        // Fresh match from lobby navigation (or after failed resume).
        clearMatchResume();
        const wire = nav!.deckWire;

        async function auth(suffix: "a" | "b", seatIndex: 0 | 1) {
          if (!nav!.useToken) {
            return {
              serverUrl: gsUrl,
              devUserId: `${nav!.userKey}-${suffix}`,
              secret: nav!.secret,
            };
          }
          const pre = nav!.seatTokens?.[seatIndex];
          if (pre) {
            return {
              serverUrl: gsUrl,
              gameToken: pre,
              secret: nav!.secret,
            };
          }
          // Guest mint is always available and keeps seat identities stable
          // across refreshes via the browser guest id / userKey prefix.
          // Retries + 20s/attempt absorb free-tier API cold starts.
          const minted = await mintGuestGameToken(hotseatGuestId(nav!.userKey, suffix));
          return {
            serverUrl: gsUrl,
            gameToken: minted.token,
            secret: nav!.secret,
          };
        }

        // Mint both seats up front (parallel) so seat 1 is not blocked behind
        // create, and a cold API is only paid once.
        const [auth0, auth1] = await Promise.all([auth("a", 0), auth("b", 1)]);
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
          void c0.disconnect(true);
          return;
        }
        bags.current[0] = bag0;
        wireBag(c0, bag0);

        const info = await withTimeout(
          c0.connect({
            ...auth0,
            preferredSeat: 0,
            deck: wire,
            createOptions: { players: [wire, wire], autoSkipMulligan: false },
          }),
          20000,
          "Hotseat create",
        );
        if (!alive()) return;
        setMatchId(info.matchId);
        matchIdRef.current = info.matchId;

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

        await withTimeout(
          c1.connect({
            ...auth1,
            roomId: info.matchId,
            preferredSeat: 1,
            deck: wire,
          }),
          20000,
          "Hotseat join",
        );
        if (!alive()) return;

        persistResume();
        if (!(await waitViews(bag0, bag1, 10000))) {
          if (!alive()) return;
          throw new Error("Hotseat connected but never received board views");
        }
        if (!alive()) return;
        setResuming(false);
        setReady(true);
      } catch (e) {
        if (alive()) {
          clearMatchResume();
          setResuming(false);
          for (const c of clients) void c.disconnect(true);
          bags.current = [null, null];
          setBootError(e instanceof Error ? e.message : "Hotseat failed");
        }
      }
    }

    // Hard ceiling so a hung mint/matchmake cannot leave the UI on Starting forever.
    // 55s covers one failed short resume + free-tier cold mint retries + create/join.
    const bootWatchdog = window.setTimeout(() => {
      if (!alive()) return;
      clearMatchResume();
      setResuming(false);
      for (const c of clients) void c.disconnect(true);
      bags.current = [null, null];
      setBootError("Hotseat startup timed out — check the game server and try again");
    }, 55000);

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
      if (b0 && b1 && matchIdRef.current && b0.connected && b1.connected) {
        parkedHotseat = {
          bags: [b0, b1],
          matchId: matchIdRef.current,
          activeSeat: activeSeatRef.current,
          timer: setTimeout(() => disposeParked(false), 2000),
        };
      } else {
        // Consented leave frees seats immediately (soft-leave on a brand-new
        // room fails Colyseus's min-uptime reconnect gate and blocks remount).
        for (const c of clients) void c.disconnect(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, bootKey]);

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
        <div style={{ display: "flex", gap: 8, padding: 16, paddingTop: 0 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearMatchResume();
              resumeOnMount.current = null;
              leavingRef.current = false;
              bags.current = [null, null];
              disposeParked(true);
              setReady(false);
              setResuming(false);
              setMatchId(null);
              matchIdRef.current = null;
              setBootError(null);
              setBootKey((k) => k + 1);
            }}
          >
            Retry fresh hotseat
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
            Back to lobby
          </button>
        </div>
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
