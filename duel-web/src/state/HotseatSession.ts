/**
 * Practice ("hotseat") match: one browser, two seats, each seat a DuelClient feeding its own match store
 * (state/matchStore.ts, the same reducer online play uses). This module owns everything that is not rendering:
 * boot (fresh / resume / takeover), the sockets, the resume blob and StrictMode parking. HotseatPage is a thin
 * view that reads `seats[n].store` through `subscribe` / `getVersion` and calls the methods here.
 */
import { getApiBaseUrl, rewriteLoopbackToPageHost } from "../config";
import { awaitDuelServicesReady, hotseatGuestId, mintGuestGameToken, mintOwnerToken } from "../net/api";
import { DuelClient } from "../net/duelClient";
import { gameServerUrlFor, rememberedGameServerUrl } from "../net/gameServer";
import {
  clearMatchResume,
  isResumeWithinGrace,
  isSeatReservationExpiredError,
  saveMatchResume,
  seatReservationUserMessage,
  type HotseatResumeBlob,
} from "../net/matchResume";
import type { Seat } from "../net/protocol";
import { applyHotseatAutoPass } from "../board/match/hotseatAutoPass";
import { hotseatControlSeat } from "../board/match/hotseatControlSeat";
import { createMatchStore, type MatchStore } from "./matchStore";

export type HotseatNavState = {
  serverUrl: string;
  secret?: string;
  userKey: string;
  useToken: boolean;
  deckWire: { leaderId: string; deck: string[] };
  deckName: string;
  /** Opponent deck for vs-self; falls back to `deckWire` when omitted (legacy resume). */
  enemyDeckWire?: { leaderId: string; deck: string[] };
  enemyDeckName?: string;
  /** Optional tokens minted on the lobby (avoids cold-start race on this page). */
  seatTokens?: [string, string];
  /** Signed-in account that owns both seats: its token rides on the joins so the match can move devices (#451). */
  owner?: "session" | "dev";
  /** Take over both seats of a practice match running on another device (#451). */
  takeover?: { roomId: string };
};

/** One seat of the practice match: its socket and the store its server messages land in. */
export type HotseatSeat = {
  client: DuelClient;
  seat: Seat;
  store: MatchStore;
  /** Drops this seat's change notifications to the session that adopted it. */
  detach?: () => void;
};

/** What the page shows that boot decides; each call mirrors one `useState` of the page. */
export type HotseatHost = {
  setMatchId: (id: string | null) => void;
  setResuming: (resuming: boolean) => void;
  setReady: (ready: boolean) => void;
  setBootError: (message: string | null) => void;
  /** Extra boot phase label (waking servers / minting) for the Starting screen. */
  setBootPhase: (phase: string | null) => void;
  /** Another device took this practice match over (#451). */
  setTakenOver: (takenOver: boolean) => void;
};

export function navFromResume(blob: HotseatResumeBlob): HotseatNavState {
  return {
    serverUrl: blob.serverUrl,
    secret: blob.secret,
    userKey: blob.userKey,
    useToken: blob.useToken,
    deckWire: blob.deckWire,
    deckName: blob.deckName,
    enemyDeckWire: blob.enemyDeckWire,
    enemyDeckName: blob.enemyDeckName,
    owner: blob.owner,
  };
}

/**
 * Park live hotseat sockets across React StrictMode remounts so we do not
 * soft-disconnect + reclaim (which rotates Colyseus reconnection tokens).
 * A deferred teardown still runs if the page truly leaves hotseat.
 */
type ParkedHotseat = {
  seats: [HotseatSeat, HotseatSeat];
  matchId: string;
  activeSeat: Seat;
  timer: ReturnType<typeof setTimeout> | null;
};
let parkedHotseat: ParkedHotseat | null = null;

/** True while sockets are parked for a remount; the page keeps seat art prefs then. */
export function hasParkedHotseat(): boolean {
  return parkedHotseat !== null;
}

function clearParkedTeardown() {
  if (parkedHotseat?.timer) {
    clearTimeout(parkedHotseat.timer);
    parkedHotseat.timer = null;
  }
}

export function disposeParked(consented: boolean) {
  clearParkedTeardown();
  const seats = parkedHotseat?.seats;
  parkedHotseat = null;
  if (!seats) return;
  for (const s of seats) {
    s.detach?.();
    void s.client.disconnect(consented);
  }
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
 * Run `fn` once on the next macrotask however many times it is called before then. Both seats of a practice match
 * get their own view message for one action; the page must render them together, not seat 0's view while seat 1's
 * (and so the device's active seat) is still the old one. The copilot (#725) plans against the view on screen: seen
 * alone, seat 0's view of an attack the defender must answer ends the plan one step early. React used to batch
 * these socket updates by scheduling the render on a macrotask; useSyncExternalStore renders synchronously, so the
 * session does the batching itself.
 */
export function coalesced(fn: () => void): () => void {
  let queued = false;
  const channel = typeof MessageChannel === "function" ? new MessageChannel() : null;
  const run = () => {
    queued = false;
    fn();
  };
  if (channel) channel.port1.onmessage = run;
  return () => {
    if (queued) return;
    queued = true;
    // A MessageChannel, like React's scheduler: unlike setTimeout it is not throttled in a background tab.
    if (channel) channel.port2.postMessage(null);
    else setTimeout(run, 0);
  };
}

export class HotseatSession {
  /** The navigation this page was opened with (a "Play here instead" edits it in place). */
  nav: HotseatNavState | null;
  /** Resume intent captured once on mount: refresh keeps history.state, so a sessionStorage blob wins over it. */
  resumeOnMount: HotseatResumeBlob | null;
  seats: [HotseatSeat | null, HotseatSeat | null] = [null, null];
  matchId: string | null;
  activeSeat: Seat;
  /** When true, skip resume persist + socket park so Leave / Back can exit. */
  leaving = false;
  /** Another device took this practice match over (#451). */
  takenOver = false;
  /** The match is on screen (both seats have a view). */
  private ready = false;
  private lastNeededSeat: Seat | null = null;
  private manualPass = false;

  private bootGen = 0;
  private version = 0;
  private listeners = new Set<() => void>();
  private routeSeen: HotseatNavState | null = null;

  constructor(
    private readonly host: HotseatHost,
    init: { routeNav: HotseatNavState | null; resume: HotseatResumeBlob | null },
  ) {
    this.resumeOnMount = init.resume;
    this.nav = init.resume ? navFromResume(init.resume) : init.routeNav;
    this.matchId = init.resume?.roomId ?? null;
    this.activeSeat = init.resume?.activeSeat ?? 0;
  }

  // ---- reading (useSyncExternalStore) ----

  /** Bumped whenever either seat's store changes or the seats are replaced. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  private bump = coalesced(() => {
    this.version++;
    for (const l of [...this.listeners]) l();
  });

  /** Fresh lobby navigation (blob cleared before navigate) updates nav once; only a new navigation replaces it. */
  noteRouteNav(routeNav: HotseatNavState | null) {
    if (routeNav && !this.resumeOnMount && this.routeSeen !== routeNav) {
      this.routeSeen = routeNav;
      this.nav = routeNav;
    }
  }

  /** The seat whose board the device shows. Changing it re-renders the page. */
  setActiveSeat(seat: Seat) {
    this.activeSeat = seat;
    this.bump();
  }

  /** "Pass device": a deliberate hand-over the auto-pass keeps until the game moment changes. */
  passDevice(to: Seat) {
    this.manualPass = true;
    this.setActiveSeat(to);
  }

  /**
   * Auto-pass when the game moment changes (pending choice, block/counter, mulligan, turn advance); a manual Pass is
   * kept until that moment changes. It runs as the views land, before the page renders them: the device must already
   * be on the seat that has to act when a view is shown, or the copilot (#725) sees the other seat's view of an attack
   * and ends its plan early. (As a page effect it ran one render late, which only batched renders hid.)
   */
  private autoPass() {
    if (!this.ready) return;
    const v0 = this.seats[0]?.store.getSnapshot().view ?? null;
    const v1 = this.seats[1]?.store.getSnapshot().view ?? null;
    const needed = hotseatControlSeat(v0 ?? v1, v0, v1);
    const next = applyHotseatAutoPass({
      needed,
      activeSeat: this.activeSeat,
      lastNeeded: this.lastNeededSeat,
      manualPass: this.manualPass,
    });
    this.lastNeededSeat = next.lastNeeded;
    this.manualPass = next.manualPass;
    if (next.activeSeat !== this.activeSeat) this.activeSeat = next.activeSeat;
  }

  /** Follow a seat's store: every change re-evaluates the auto-pass, then re-renders the page. */
  attach(s: HotseatSeat) {
    s.detach?.();
    s.detach = s.store.subscribe(() => {
      this.autoPass();
      this.bump();
    });
    this.bump();
  }

  /** The match is on screen: auto-pass starts following the views. */
  markReady(ready: boolean) {
    this.ready = ready;
    this.host.setReady(ready);
    if (ready) this.autoPass();
  }

  private setMatchId(id: string | null) {
    this.matchId = id;
    this.host.setMatchId(id);
  }

  persistResume() {
    const nav = this.nav;
    // A takeover launch has no deck to resume from; the lobby card brings it back.
    if (this.leaving || !nav || nav.takeover || this.takenOver) return;
    const [b0, b1] = this.seats;
    const t0 = b0?.client.getReconnectionToken();
    const t1 = b1?.client.getReconnectionToken();
    const room = this.matchId ?? b0?.client.roomId;
    if (!t0 || !t1 || !room) return;
    saveMatchResume({
      mode: "hotseat",
      // The server seat 0 created / rejoined the match on, so a reload goes back to that pool.
      serverUrl: rewriteLoopbackToPageHost(b0?.client.serverUrl ?? nav.serverUrl),
      roomId: room,
      secret: nav.secret,
      userKey: nav.userKey,
      useToken: nav.useToken,
      deckWire: nav.deckWire,
      deckName: nav.deckName,
      enemyDeckWire: nav.enemyDeckWire,
      enemyDeckName: nav.enemyDeckName,
      owner: nav.owner,
      seats: [{ reconnectionToken: t0 }, { reconnectionToken: t1 }],
      activeSeat: this.activeSeat,
      savedAt: Date.now(),
    });
  }

  /** Both seats are connected (the resume clock, park and reload checks all ask this). */
  bothConnected(): boolean {
    const [b0, b1] = this.seats;
    return Boolean(b0?.store.getSnapshot().connected && b1?.store.getSnapshot().connected);
  }

  /** Both seats' sockets are still open and the match is not over: the visibility recovery should check them. */
  liveSeats(): [HotseatSeat, HotseatSeat] | null {
    const seats = this.seats;
    if (!seats[0] || !seats[1] || seats.some((b) => b?.store.getSnapshot().matchOver)) return null;
    return seats as [HotseatSeat, HotseatSeat];
  }

  // ---- page actions ----

  /** Take both seats back: re-run the boot as a takeover of this room (the page then bumps its boot key). */
  prepareTakeover(roomId: string) {
    this.nav = { ...this.nav!, takeover: { roomId } };
    this.takenOver = false;
    this.leaving = false;
    this.ready = false;
    this.seats = [null, null];
    disposeParked(true);
  }

  /** Retry after a boot error: forget the resume blob and any seats (the page then bumps its boot key). */
  prepareRetry() {
    clearMatchResume();
    this.resumeOnMount = null;
    this.leaving = false;
    this.ready = false;
    this.seats = [null, null];
    disposeParked(true);
    this.matchId = null;
  }

  leave() {
    this.leaving = true;
    clearMatchResume();
    this.matchId = null;
    disposeParked(true);
    const toClose = this.seats;
    this.seats = [null, null];
    // Close both seats in the background; the lobby shouldn't wait on the server.
    void Promise.allSettled(toClose.map((b) => (b ? b.client.disconnect(true) : Promise.resolve())));
  }

  // ---- boot (the page's effect) ----

  /** Start (or reclaim) the match. Returns the effect cleanup. */
  run(): () => void {
    clearParkedTeardown();

    const nav = this.nav!;
    const resumeHotseat = this.resumeOnMount;
    const gen = ++this.bootGen;
    let cancelled = false;
    const clients: DuelClient[] = [];
    /** Pending view waits, released (as "no views") when this run is cancelled. */
    const waiters = new Set<() => void>();

    const alive = () => !cancelled && gen === this.bootGen;

    const adopt = (s: HotseatSeat) => this.attach(s);

    const makeSeat = (client: DuelClient, seat: Seat): HotseatSeat => {
      clients.push(client);
      const s: HotseatSeat = { client, seat, store: createMatchStore("hotseat", { seat }) };
      adopt(s);
      this.bindHandlers(s, alive);
      return s;
    };

    /** Resolves true once both seats have a view, false on timeout or when this run is cancelled. */
    const waitViews = (s0: HotseatSeat, s1: HotseatSeat, ms: number): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const have = () => Boolean(s0.store.getSnapshot().view && s1.store.getSnapshot().view);
        if (have()) return resolve(true);
        if (!alive()) return resolve(false);
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          off0();
          off1();
          waiters.delete(abort);
          resolve(ok);
        };
        const abort = () => finish(false);
        const check = () => {
          if (have()) finish(true);
        };
        const off0 = s0.store.subscribe(check);
        const off1 = s1.store.subscribe(check);
        const timer = setTimeout(() => finish(have()), ms);
        waiters.add(abort);
      });

    const cleanup = () => {
      cancelled = true;
      for (const abort of [...waiters]) abort();
      window.clearTimeout(bootDelay);
      window.clearTimeout(bootWatchdog);
      // Intentional Leave: tear down immediately and do not re-park / re-resume.
      if (this.leaving) {
        this.matchId = null;
        this.seats = [null, null];
        disposeParked(true);
        for (const c of clients) void c.disconnect(true);
        return;
      }
      // Park sockets briefly so StrictMode remount can reclaim them without
      // rotating reconnection tokens. Real navigation/unload tears down after.
      const [b0, b1] = this.seats;
      if (b0 && b1 && this.matchId && b0.store.getSnapshot().connected && b1.store.getSnapshot().connected) {
        b0.detach?.();
        b1.detach?.();
        parkedHotseat = {
          seats: [b0, b1],
          matchId: this.matchId,
          activeSeat: this.activeSeat,
          timer: setTimeout(() => disposeParked(false), 2000),
        };
      } else {
        // Consented leave frees seats immediately (soft-leave on a brand-new
        // room fails Colyseus's min-uptime reconnect gate and blocks remount).
        for (const c of clients) void c.disconnect(true);
      }
    };

    // Reclaim sockets parked by StrictMode remount — avoids token rotation.
    // Only reclaim healthy (still connected) seats. Stale parked seats with
    // views but dead sockets used to mark ready and hang; disconnected seats
    // fall through to a fresh boot instead of waiting out the watchdog.
    let bootDelay: number | undefined;
    let bootWatchdog: number | undefined;
    if (parkedHotseat?.matchId && parkedHotseat.seats[0] && parkedHotseat.seats[1]) {
      const parked = parkedHotseat;
      parkedHotseat = null;
      const healthy = parked.seats[0].store.getSnapshot().connected && parked.seats[1].store.getSnapshot().connected;
      if (!healthy) {
        for (const s of parked.seats) void s.client.disconnect(true);
      } else {
        this.seats = parked.seats;
        this.setMatchId(parked.matchId);
        this.setActiveSeat(parked.activeSeat);
        this.host.setResuming(true);
        for (const s of parked.seats) {
          clients.push(s.client);
          adopt(s);
          this.bindHandlers(s, alive);
        }
        void (async () => {
          const [p0, p1] = parked.seats;
          if (p0.store.getSnapshot().view && p1.store.getSnapshot().view) {
            if (!alive()) return;
            this.host.setResuming(false);
            this.markReady(true);
            return;
          }
          const ok = await waitViews(p0, p1, 8000);
          if (!alive()) return;
          if (!ok || !p0.store.getSnapshot().connected || !p1.store.getSnapshot().connected) {
            for (const s of parked.seats) void s.client.disconnect(true);
            this.seats = [null, null];
            clearMatchResume();
            this.host.setResuming(false);
            this.host.setBootError("Hotseat reconnected but lost the board — try again");
            return;
          }
          this.host.setResuming(false);
          this.markReady(true);
        })();
        return cleanup;
      }
    }

    /** Move both seats of a live practice match here: same account, a seat each. */
    const bootTakeover = async (roomId: string) => {
      clearMatchResume();
      this.takenOver = false;
      const gsUrl = rewriteLoopbackToPageHost(nav.serverUrl);
      this.host.setBootPhase("Moving the match here…");
      const gameToken = await mintOwnerToken(nav.owner, nav.userKey);
      if (!gameToken) throw new Error("Sign in to move a match to this device.");
      if (!alive()) return;
      const made = ([0, 1] as const).map((seat) => makeSeat(new DuelClient(), seat)) as [HotseatSeat, HotseatSeat];
      this.seats = made;
      for (const s of made) {
        await withTimeout(
          s.client.connect({
            serverUrl: gsUrl,
            gameToken,
            secret: nav.secret,
            roomId,
            preferredSeat: s.seat,
            takeover: true,
          }),
          50000,
          `Hotseat seat ${s.seat} takeover`,
        );
        if (!alive()) return;
      }
      this.setMatchId(roomId);
      this.host.setBootPhase(null);
      if (!(await waitViews(made[0], made[1], 10000))) {
        if (!alive()) return;
        throw new Error("Moved the match but never received board views");
      }
      if (!alive()) return;
      this.host.setResuming(false);
      this.markReady(true);
    };

    const boot = async () => {
      try {
        if (nav.takeover) {
          await bootTakeover(nav.takeover.roomId);
          return;
        }
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
          this.resumeOnMount = null;
          console.warn("[hotseat] resume blob past reconnect grace; starting fresh");
        }
        // Lobby / resume may bake localhost; rewrite when the SPA is on a
        // non-loopback host so mint + matchmake hit this machine's game server.
        const gsUrl = rewriteLoopbackToPageHost(nav.serverUrl);

        if (shouldResume) {
          this.host.setResuming(true);
          const resumeUrl = rewriteLoopbackToPageHost(shouldResume.serverUrl);
          const s0 = makeSeat(new DuelClient(), 0);
          const s1 = makeSeat(new DuelClient(), 1);
          this.seats = [s0, s1];
          const c0 = s0.client;
          const c1 = s1.client;

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
            this.setMatchId(w0.matchId);
            if (shouldResume.activeSeat === 0 || shouldResume.activeSeat === 1) {
              this.setActiveSeat(shouldResume.activeSeat);
            }
            this.persistResume();
            if (!(await waitViews(s0, s1, 8000))) {
              if (!alive()) return;
              throw new Error("Hotseat reconnected but never received board views");
            }
            if (!alive()) return;
            this.host.setResuming(false);
            this.markReady(true);
            return;
          } catch (resumeErr) {
            // Dead tokens / wrong host: drop resume and create a fresh match
            // instead of sitting on Starting until the watchdog.
            if (!alive()) return;
            for (const c of [c0, c1]) void c.disconnect(true);
            this.seats = [null, null];
            clearMatchResume();
            this.resumeOnMount = null;
            this.host.setResuming(false);
            console.warn(
              "[hotseat] resume failed, starting fresh",
              resumeErr instanceof Error ? resumeErr.message : resumeErr,
            );
          }
        }

        // Fresh match from lobby navigation (or after failed resume).
        clearMatchResume();
        const wire = nav.deckWire;
        const enemyWire = nav.enemyDeckWire ?? wire;

        // Wake API + game-server here (visible Starting UI) instead of blocking
        // the lobby with grayed buttons for up to 20s.
        this.host.setBootPhase("Waking API & game server…");
        await awaitDuelServicesReady(getApiBaseUrl(), rememberedGameServerUrl() ?? gsUrl, 25000);
        if (!alive()) return;

        const auth = async (suffix: "a" | "b", seatIndex: 0 | 1) => {
          if (!nav.useToken) {
            return {
              serverUrl: gsUrl,
              devUserId: `${nav.userKey}-${suffix}`,
              secret: nav.secret,
            };
          }
          const pre = nav.seatTokens?.[seatIndex];
          if (pre) {
            return {
              serverUrl: gsUrl,
              gameToken: pre,
              secret: nav.secret,
            };
          }
          // Guest mint is always available and keeps seat identities stable
          // across refreshes via the browser guest id / userKey prefix.
          // Retries + 20s/attempt absorb free-tier API cold starts.
          const minted = await mintGuestGameToken(hotseatGuestId(nav.userKey, suffix));
          return {
            serverUrl: gameServerUrlFor(minted, gsUrl),
            gameToken: minted.token,
            secret: nav.secret,
          };
        };

        // A signed-in account's token rides on both joins so this practice
        // match can later move to another device (guests have nothing to move).
        const ownerTokenPromise = mintOwnerToken(nav.owner, nav.userKey).catch(() => null);
        this.host.setBootPhase("Minting seat tokens…");
        // Mint both seats up front (parallel) so seat 1 is not blocked behind
        // create, and a cold API is only paid once.
        const [auth0, auth1, ownerToken] = await Promise.all([
          auth("a", 0),
          auth("b", 1),
          ownerTokenPromise,
        ]);
        if (!alive()) return;

        this.host.setBootPhase("Creating match…");
        const c0 = new DuelClient();
        if (!alive()) {
          clients.push(c0);
          void c0.disconnect(true);
          return;
        }
        const s0 = makeSeat(c0, 0);
        this.seats[0] = s0;

        // 50s allows up to ~3 seat-reservation retries against a 15s default
        // GS pin while the Render deploy branch catches up to the 90s setting.
        const info = await withTimeout(
          c0.connect({
            ...auth0,
            ownerToken: ownerToken ?? undefined,
            preferredSeat: 0,
            deck: wire,
            createOptions: {
              players: [wire, enemyWire],
              autoSkipMulligan: false,
              ranked: false,
            },
          }),
          50000,
          "Hotseat create",
        );
        if (!alive()) return;
        this.setMatchId(info.matchId);

        this.host.setBootPhase("Joining second seat…");
        const c1 = new DuelClient();
        const s1 = makeSeat(c1, 1);
        this.seats[1] = s1;

        await withTimeout(
          c1.connect({
            ...auth1,
            // The room lives where seat 0 created it, whatever pool seat 1's token names.
            serverUrl: c0.serverUrl ?? auth1.serverUrl,
            ownerToken: ownerToken ?? undefined,
            roomId: info.matchId,
            preferredSeat: 1,
            deck: enemyWire,
          }),
          50000,
          "Hotseat join",
        );
        if (!alive()) return;

        this.host.setBootPhase(null);
        this.persistResume();
        if (!(await waitViews(s0, s1, 10000))) {
          if (!alive()) return;
          throw new Error("Hotseat connected but never received board views");
        }
        if (!alive()) return;
        this.host.setResuming(false);
        this.markReady(true);
      } catch (e) {
        if (alive()) {
          clearMatchResume();
          this.host.setResuming(false);
          this.host.setBootPhase(null);
          for (const c of clients) void c.disconnect(true);
          this.seats = [null, null];
          this.host.setBootError(
            isSeatReservationExpiredError(e) ? seatReservationUserMessage() : e instanceof Error ? e.message : "Hotseat failed",
          );
        }
      }
    };

    // Hard ceiling so a hung mint/matchmake cannot leave the UI on Starting forever.
    // Covers wake + mint retries + create/join seat-reservation retries.
    bootWatchdog = window.setTimeout(() => {
      if (!alive()) return;
      clearMatchResume();
      this.host.setResuming(false);
      this.host.setBootPhase(null);
      for (const c of clients) void c.disconnect(true);
      this.seats = [null, null];
      this.host.setBootError("Hotseat startup timed out — check the game server and try again");
    }, 120000);

    // Defer connect past React StrictMode's immediate remount so the first
    // mount cancels before opening sockets (avoids soft-leave on a <5s room).
    bootDelay = window.setTimeout(() => {
      void boot().finally(() => {
        window.clearTimeout(bootWatchdog);
      });
    }, 75);

    return cleanup;
  }

  /** Feed one seat's server messages to its store; the store always updates, the page effects only while `alive`. */
  private bindHandlers(s: HotseatSeat, alive: () => boolean) {
    const { store, client } = s;
    client.setHandlers({
      onWelcome: (info) => {
        // Always stash the view so StrictMode park/reclaim keeps boards even
        // when this mount was already cancelled. The brief is always from seat 0's side
        // (the player's deck against the practice opponent).
        store.dispatch({ type: "welcome", info });
        if (!alive()) return;
        this.setMatchId(info.matchId);
        this.persistResume();
      },
      onView: (view) => store.dispatch({ type: "view", view }),
      onEvents: (events, step) => store.dispatch({ type: "events", events, step }),
      onMatchOver: (msg) => {
        store.dispatch({ type: "matchOver", result: msg.result });
        if (!alive()) return;
        clearMatchResume();
      },
      onError: (err) => store.dispatch({ type: "error", err }),
      onStaleIllegalIntent: () => store.dispatch({ type: "staleIllegalIntent" }),
      onUndoState: (state) => {
        store.dispatch({ type: "undoState", state });
        // Both seats are this player: the other seat's client accepts at once.
        if (state.pending && state.pending.from !== s.seat) {
          try {
            client.sendUndo("accept", { id: state.pending.id });
          } catch {
            /* socket gone; the request lapses */
          }
        }
      },
      onRematchState: (state) => store.dispatch({ type: "rematchState", state }),
      onUndoApplied: (info) => store.dispatch({ type: "undoApplied", info }),
      onTakenOver: () => {
        store.dispatch({ type: "takenOver" });
        this.takenOver = true;
        clearMatchResume();
        if (!alive()) return;
        this.host.setTakenOver(true);
      },
      onDisconnect: () => store.dispatch({ type: "disconnect" }),
      onReconnectionToken: () => {
        if (!alive()) return;
        this.persistResume();
      },
    });
  }
}
