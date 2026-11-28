import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SignInLink } from "../analytics/SignInLink";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import type { SeatPlayers } from "../net/protocol";
import { fetchMatchReplay, ReplayLoadError, type ReplayLoadFailure, type ReplayPayload } from "../replay/replayApi";
import { loadWhileSaving, type ReplayNavState } from "../replay/replayRetry";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplay, type Replay } from "../replay/useReplay";
import { useGameReview } from "../replay/useGameReview";
import { BackLink } from "../layout/BackLink";
import "../history/history.css";
import "../replay/replay.css";

type Load =
  | { status: "loading"; saving?: boolean }
  | { status: "failed"; reason: ReplayLoadFailure; message: string }
  | { status: "ready"; payload: ReplayPayload };

function ReplayNotice({ title, children, matchId, signIn = false }: { title: string; children: string; matchId: string; signIn?: boolean }) {
  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <BackLink to="/history" label="Match history" ariaLabel="Back to match history" />
          <h1 className="page-title">{title}</h1>
        </header>
        <section className="panel replay-notice" role="status">
          <p className="panel-copy">{children}</p>
          <div className="btn-row">
            {signIn ? (
              <SignInLink className="btn btn-primary">
                Sign in with Google
              </SignInLink>
            ) : null}
            {matchId ? (
              <Link className={`btn ${signIn ? "btn-secondary" : "btn-primary"}`} to={`/history/${encodeURIComponent(matchId)}`}>
                Read the match log
              </Link>
            ) : null}
            <Link className="btn btn-secondary" to="/history">
              Back to match history
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

const FAILURE_COPY: Record<ReplayLoadFailure, { title: string; text: string }> = {
  "signed-out": { title: "Sign in to watch", text: "Sign in to watch replays of your duels." },
  "not-found": { title: "Replay unavailable", text: "No replay was kept for this game, or it is not one of yours." },
  "in-progress": { title: "Still being played", text: "This game is still being played. Its replay opens once it is over." },
  error: { title: "Replay unavailable", text: "Could not load this replay. Try again in a moment." },
};

function replayNote(status: { kind: string } | undefined, atEnd: boolean, matchId: string): ReactNode {
  if (status?.kind === "drift") return <span title="Recorded on an older rules version; some moments may play differently.">Older rules: some moments may differ</span>;
  if (status?.kind === "partial") {
    return atEnd ? (
      <>
        <span>Stops here: card rules changed.</span> <Link to={`/history/${encodeURIComponent(matchId)}`}>Full log →</Link>
      </>
    ) : (
      <span title="Card rules changed since this game, so the replay stops early.">Card rules changed: stops early</span>
    );
  }
  return null;
}

function ReplayBoard({ payload }: { payload: ReplayPayload }) {
  const navigate = useNavigate();
  // /replay/:id?review=1 opens straight into the game review (#1388).
  const startInReview = useSearchParams()[0].get("review") === "1";
  const replay: Replay = useReplay(payload);
  const players = useMemo<SeatPlayers>(() => [{ name: payload.players[0] }, { name: payload.players[1] }], [payload.players]);
  const matchId = payload.match_id;
  const review = useGameReview(matchId, payload.replay, replay.phase === "ready" && payload.replay.end != null);
  if (replay.phase === "unavailable") {
    const text =
      replay.status.reason === "schema"
        ? "This recording was made by a different version of the game and cannot be played back."
        : "The game rules have changed since this game, so it can no longer be played back.";
    return (
      <ReplayNotice title="Replay unavailable" matchId={matchId}>
        {text}
      </ReplayNotice>
    );
  }

  const ready = replay.phase === "ready" ? replay : null;
  const { status } = ready ?? {};
  const result = ready && ready.atEnd && !ready.timeline.diverged ? (payload.replay.end ?? null) : null;

  return (
    <div className="duel-root replay-root">
      <DuelBoard
        view={ready ? ready.view : null}
        seat={ready ? ready.controls.cameraSeat : payload.your_seat}
        matchId={null}
        errorBanner={ready?.error ?? null}
        matchOver={result}
        players={players}
        battleLog={ready?.battleLog}
        waiting={ready ? undefined : { status: `Rebuilding the game… ${Math.round(replay.phase === "building" ? replay.progress * 100 : 100)}%` }}
        leaveLabel="Exit replay"
        replay={ready ? { controls: <ReplayControls state={ready.controls} actions={ready.actions} note={replayNote(status, ready.atEnd, matchId)} reserveRow={payload.replay.end != null} review={payload.replay.end != null ? review : null} startInReview={startInReview} />, quiet: ready.quiet } : undefined}
        onSendIntent={ready ? ready.sendIntent : () => undefined}
        onLeave={() => navigate("/history")}
        onClearError={ready ? ready.clearError : () => undefined}
      />
    </div>
  );
}

export default function ReplayPage() {
  const { matchId = "" } = useParams();
  const fromMatchOver = (useLocation().state as ReplayNavState)?.fromMatchOver === true;
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    const fetched = fromMatchOver
      ? loadWhileSaving(() => fetchMatchReplay(matchId), {
          onWait: () => live && setLoad({ status: "loading", saving: true }),
          cancelled: () => !live,
        })
      : fetchMatchReplay(matchId);
    fetched
      .then((payload) => live && setLoad({ status: "ready", payload }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ReplayLoadError) setLoad({ status: "failed", reason: e.reason, message: e.message });
        else setLoad({ status: "failed", reason: "error", message: "Could not load this replay" });
      });
    return () => {
      live = false;
    };
  }, [matchId, fromMatchOver]);

  if (load.status === "failed") {
    const copy = FAILURE_COPY[load.reason];
    return (
      <ReplayNotice title={copy.title} matchId={matchId} signIn={load.reason === "signed-out"}>
        {copy.text}
      </ReplayNotice>
    );
  }
  if (load.status === "loading") {
    return (
      <div className="duel-root replay-root">
        <DuelBoard
          view={null}
          seat={null}
          matchId={null}
          errorBanner={null}
          matchOver={null}
          waiting={{ status: load.saving ? "Saving the game…" : "Loading the recording…" }}
          leaveLabel="Exit replay"
          onSendIntent={() => undefined}
          onLeave={() => window.history.back()}
          onClearError={() => undefined}
        />
      </div>
    );
  }
  return <ReplayBoard payload={load.payload} />;
}
