import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGameDoneEvent } from "../analytics/useProductEvents";
import { DuelBoard } from "../board/DuelBoard";
import {
  initSeatArtPrefsFromStorage,
  resetAllSeatArtPrefs,
  setCosmeticsPublisher,
} from "../decks/seatArtPrefs";
import { MovedElsewhereOverlay } from "../board/match/MovedElsewhereOverlay";
import { rematchDeckOptions } from "../decks/rematchDecks";
import { loadMatchResume, touchMatchResume } from "../net/matchResume";
import type { Intent, RematchAction, Seat } from "../net/protocol";
import { HotseatSession, hasParkedHotseat, type HotseatNavState } from "../state/HotseatSession";

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
      if ((location.state as HotseatNavState | null)?.takeover) return null;
      return existing?.mode === "hotseat" ? existing : null;
    })(),
  );
  const resumeHotseat = resumeOnMount.current;

  const [matchId, setMatchId] = useState<string | null>(resumeHotseat?.roomId ?? null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [resuming, setResuming] = useState(Boolean(resumeHotseat));
  const [takenOver, setTakenOver] = useState(false);
  const [bootPhase, setBootPhase] = useState<string | null>(null);

  const sessionRef = useRef<HotseatSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new HotseatSession(
      { setMatchId, setResuming, setReady, setBootError, setBootPhase, setTakenOver },
      { routeNav: navFromRoute, resume: resumeHotseat },
    );
  }
  const session = sessionRef.current;
  session.noteRouteNav(navFromRoute);
  const nav = session.nav;
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
  const activeSeat = session.activeSeat;

  useEffect(() => {
    if (!session.nav) {
      navigate("/", { replace: true });
      return;
    }
    return session.run();
  }, [navigate, bootKey, session]);

  useEffect(() => {
    if (!ready) return;
    setCosmeticsPublisher(null);
    initSeatArtPrefsFromStorage(0);
    initSeatArtPrefsFromStorage(1);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    session.persistResume();
  }, [activeSeat, ready, session]);

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

  useEffect(() => {
    return () => {
      if (!hasParkedHotseat()) {
        setCosmeticsPublisher(null);
        resetAllSeatArtPrefs();
      }
    };
  }, []);

  const seatNow = session.seats[activeSeat]?.store.getSnapshot();
  useGameDoneEvent(seatNow?.matchOver != null || seatNow?.view?.winner != null, "practice");
  if (!nav) return null;

  const bag = session.seats[activeSeat];
  const state = bag?.store.getSnapshot() ?? null;
  const seat0State = session.seats[0]?.store.getSnapshot() ?? null;
  const other: Seat = activeSeat === 0 ? 1 : 0;

  function sendIntent(intent: Intent) {
    bag?.client.sendIntent(intent);
  }

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
        hotseatPass={{ otherSeat: other, onPass: () => session.passDevice(other) }}
        rematch={{
          state: state.rematch,
          autoAccept: true,
          deckOptions: rematchDecks,
          onAction: (action: RematchAction, decks) => {
            const rematchState = state.rematch;
            const targets =
              action === "request" || action === "decline"
                ? session.seats
                : rematchState?.chooser != null
                  ? [session.seats[rematchState.chooser]]
                  : [];
            for (const b of targets) {
              try {
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
