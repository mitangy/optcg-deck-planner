import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import { applyHotseatAutoPass } from "../board/hotseatAutoPass";
import { hotseatControlSeat } from "../board/hotseatControlSeat";
import {
  initSeatArtPrefsFromStorage,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
import { MovedElsewhereOverlay } from "../board/MovedElsewhereOverlay";
import { rematchDeckOptions } from "../decks/rematchDecks";
import { loadMatchResume, touchMatchResume } from "../net/matchResume";
import type { Intent, RematchAction, Seat } from "../net/protocol";
import { HotseatSession, hasParkedHotseat, type HotseatNavState } from "../state/HotseatSession";

/**
 * One browser, two seats — pass the device between turns.
 * Refresh auto-reconnects both seats from the sessionStorage resume blob.
 * Boot, sockets, resume and StrictMode parking live in state/HotseatSession.ts; this page renders the seat
 * whose turn it is from that session's per-seat match stores.
 */
export function HotseatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const rematchDecks = useMemo(() => rematchDeckOptions(), []);
  const navFromRoute = (location.state ?? null) as HotseatNavState | null;
  // Capture resume intent once on mount. Refresh keeps history.state, so we
  // prefer a sessionStorage blob over treating that state as a fresh start.
  const resumeOnMount = useRef(
    (() => {
      const existing = loadMatchResume();
      // A takeover launch starts from the server's room, never from this tab's old blob.
      if ((location.state as HotseatNavState | null)?.takeover) return null;
      return existing?.mode === "hotseat" ? existing : null;
    })(),
  );
  const resumeHotseat = resumeOnMount.current;

  const [activeSeat, setActiveSeat] = useState<Seat>(resumeHotseat?.activeSeat ?? 0);
  const [matchId, setMatchId] = useState<string | null>(resumeHotseat?.roomId ?? null);
  const [bootError, setBootError] = useState<string | null>(null);
  /** Bump to remount the boot effect for Retry (fresh match). */
  const [bootKey, setBootKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [resuming, setResuming] = useState(Boolean(resumeHotseat));
  /** Another device took this practice match over (#451). */
  const [takenOver, setTakenOver] = useState(false);
  /** Extra boot phase label (waking servers / minting) for the Starting screen. */
  const [bootPhase, setBootPhase] = useState<string | null>(null);
  const lastNeededSeatRef = useRef<Seat | null>(null);
  const manualPassRef = useRef(false);

  const sessionRef = useRef<HotseatSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new HotseatSession(
      { setMatchId, setActiveSeat, setResuming, setReady, setBootError, setBootPhase, setTakenOver },
      { routeNav: navFromRoute, resume: resumeHotseat },
    );
  }
  const session = sessionRef.current;
  // Fresh lobby navigation (blob cleared before navigate) updates nav once.
  // Only a new navigation replaces nav: "Play here instead" edits it in place.
  session.noteRouteNav(navFromRoute);
  const nav = session.nav;
  // Re-render on any change to either seat's match store (or when the seats are replaced).
  const version = useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);

  useEffect(() => {
    if (!session.nav) {
      navigate("/", { replace: true });
      return;
    }
    return session.run();
  }, [navigate, bootKey, session]);

  useEffect(() => {
    if (!ready) return;
    // Shared in-process maps — no cosmetics network relay for hotseat.
    // Seed once when the match becomes ready; do not re-seed on seat switch
    // or divergent per-seat alt picks would be wiped.
    setCosmeticsPublisher(null);
    initSeatArtPrefsFromStorage(0);
    initSeatArtPrefsFromStorage(1);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    session.persistResume();
  }, [activeSeat, ready, session]);

  // Same as an online duel: keep the resume blob's clock at "last seen alive"
  // while the phone is in another app, and on return reload into the saved
  // match if either seat's socket died (a Home Screen app has no reload button).
  useEffect(() => {
    if (!ready) return;
    let checking = false;
    async function recoverIfDropped() {
      if (checking || session.leaving || session.takenOver) return;
      const seats = session.liveSeats();
      if (!seats) return;
      checking = true;
      try {
        for (const b of seats) {
          if (b.client.isReconnecting) continue;
          if (!(await b.client.isAlive())) {
            if (b.client.isReconnecting || session.leaving) return;
            window.location.reload();
            return;
          }
        }
      } finally {
        checking = false;
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void recoverIfDropped();
      else if (session.bothConnected()) touchMatchResume();
    };
    const onPageHide = () => {
      if (session.bothConnected()) touchMatchResume();
    };
    const onResume = () => void recoverIfDropped();
    const heartbeat = window.setInterval(() => {
      if (session.bothConnected()) touchMatchResume();
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
  }, [ready, session]);

  // Auto-pass when the game moment changes (pending choice, block/counter,
  // mulligan, turn advance). Manual Pass is kept until that moment changes.
  useEffect(() => {
    if (!ready) return;
    const v0 = session.seats[0]?.store.getSnapshot().view ?? null;
    const v1 = session.seats[1]?.store.getSnapshot().view ?? null;
    const needed = hotseatControlSeat(v0 ?? v1, v0, v1);
    const next = applyHotseatAutoPass({
      needed,
      activeSeat: session.activeSeat,
      lastNeeded: lastNeededSeatRef.current,
      manualPass: manualPassRef.current,
    });
    lastNeededSeatRef.current = next.lastNeeded;
    manualPassRef.current = next.manualPass;
    if (next.activeSeat !== session.activeSeat) {
      session.setActiveSeat(next.activeSeat);
    }
  }, [ready, version, session]);

  function passDevice(to: Seat) {
    manualPassRef.current = true;
    session.setActiveSeat(to);
  }

  useEffect(() => {
    return () => {
      if (!hasParkedHotseat()) {
        setCosmeticsPublisher(null);
        resetAllSeatArtPrefs();
      }
    };
  }, []);

  if (!nav) return null;

  const bag = session.seats[activeSeat];
  const state = bag?.store.getSnapshot() ?? null;
  const seat0State = session.seats[0]?.store.getSnapshot() ?? null;
  const other: Seat = activeSeat === 0 ? 1 : 0;

  function sendIntent(intent: Intent) {
    bag?.client.sendIntent(intent);
  }

  /** Take both seats back: re-run the boot as a takeover of this room. */
  function playHere(roomId: string) {
    session.prepareTakeover(roomId);
    setTakenOver(false);
    setReady(false);
    setResuming(false);
    setBootPhase(null);
    setBootError(null);
    setBootKey((k) => k + 1);
  }

  async function leave() {
    session.leave();
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
              session.prepareRetry();
              setReady(false);
              setResuming(false);
              setBootPhase(null);
              setMatchId(null);
              setBootError(null);
              setBootKey((k) => k + 1);
            }}
          >
            {nav.takeover ? "Try again" : "Retry fresh hotseat"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (!ready || !state?.view) {
    // The board is up from the first frame; waking servers / minting happens behind it.
    return (
      <div className="duel-root">
        <DuelBoard
          view={null}
          seat={activeSeat}
          matchId={matchId}
          errorBanner={null}
          matchOver={null}
          waiting={{
            status: resuming
              ? "Reconnecting both seats…"
              : (bootPhase ?? "Starting practice…"),
            youLeaderId: nav.deckWire.leaderId || null,
            oppLeaderId: (nav.enemyDeckWire ?? nav.deckWire).leaderId || null,
          }}
          leaveLabel="Cancel"
          onSendIntent={() => undefined}
          onLeave={() => void leave()}
          onClearError={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="duel-root">
      <DuelBoard
        view={state.view}
        seat={activeSeat}
        matchId={matchId}
        errorBanner={state.errorBanner}
        matchOver={state.matchOver}
        battleLog={state.battleLog}
        firstSeatPickedBy={seat0State?.firstSeatPickedBy}
        matchBrief={{ brief: seat0State?.brief ?? null, ranked: seat0State?.ranked ?? null, ticketSeat: 0 }}
        hotseatPass={{ otherSeat: other, onPass: () => passDevice(other) }}
        rematch={{
          state: state.rematch,
          autoAccept: true,
          deckOptions: rematchDecks,
          onAction: (action: RematchAction, decks) => {
            // Both seats are this player: agree from both, and let the losing
            // seat's client pick the turn order.
            const rematchState = state.rematch;
            const targets =
              action === "request" || action === "decline"
                ? session.seats
                : rematchState?.chooser != null
                  ? [session.seats[rematchState.chooser]]
                  : [];
            for (const b of targets) {
              try {
                // Each seat's client carries its own seat's deck pick.
                const s = session.seats.indexOf(b);
                b?.client.sendRematch(action, action === "request" && s >= 0 ? decks?.[s] : undefined);
              } catch {
                /* disconnected */
              }
            }
          },
        }}
        undo={{
          state: state.undo,
          autoAccept: true,
          onAction: (action, opts) => {
            try {
              bag?.client.sendUndo(action, opts);
            } catch {
              /* disconnected; the board shows the reconnect state */
            }
          },
        }}
        leaveLabel="Leave match"
        onSendIntent={takenOver ? () => undefined : sendIntent}
        onLeave={() => void leave()}
        onClearError={() => {
          bag?.store.dispatch({ type: "setError", message: null });
        }}
      />
      {takenOver && matchId ? (
        <MovedElsewhereOverlay onPlayHere={() => playHere(matchId)} onLeave={() => void leave()} />
      ) : null}
    </div>
  );
}
