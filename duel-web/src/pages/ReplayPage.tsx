import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import type { SeatPlayers } from "../net/protocol";
import { googleLoginUrl } from "../net/api";
import { fetchMatchReplay, ReplayLoadError, type ReplayLoadFailure, type ReplayPayload } from "../replay/replayApi";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplay, type Replay } from "../replay/useReplay";
import { BackLink } from "./BackLink";
import "../history/history.css";
import "../replay/replay.css";

type Load =
  | { status: "loading" }
  | { status: "failed"; reason: ReplayLoadFailure; message: string }
  | { status: "ready"; payload: ReplayPayload };

/** A full-page message in place of the board, with a way to the written log. */
function ReplayNotice({ title, children, matchId, signIn = false }: { title: string; children: string; matchId: string; signIn?: boolean }) {
  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <BackLink to="/history" label="History" ariaLabel="Back to match history" />
          <h1 className="page-title">{title}</h1>
        </header>
        <section className="panel replay-notice" role="status">
          <p className="panel-copy">{children}</p>
          <div className="btn-row">
            {signIn ? (
              <a className="btn btn-primary" href={googleLoginUrl()}>
                Sign in with Google
              </a>
            ) : null}
            {matchId ? (
              <Link className={`btn ${signIn ? "btn-secondary" : "btn-primary"}`} to={`/history/${encodeURIComponent(matchId)}`}>
                Read the match log
              </Link>
            ) : null}
            <Link className="btn btn-secondary" to="/history">
              Back to history
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

/**
 * One slim line inside the controls (never over the board). It exists for the whole viewing when the
 * recording drifted or stops early, so the controls keep their size when its words change.
 */
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

/** The recording on the board once it is loaded; the engine work happens in `useReplay`. */
function ReplayBoard({ payload }: { payload: ReplayPayload }) {
  const navigate = useNavigate();
  const replay: Replay = useReplay(payload);
  const players = useMemo<SeatPlayers>(() => [{ name: payload.players[0] }, { name: payload.players[1] }], [payload.players]);
  const matchId = payload.match_id;
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
  // The result belongs to the real end of the game, not to wherever the engine stopped.
  const result = ready && ready.atEnd && !ready.timeline.diverged ? (payload.replay.end ?? null) : null;

  return (
    <div className="duel-root replay-root">
      <DuelBoard
        view={ready ? ready.view : null}
        seat={ready ? ready.controls.cameraSeat : payload.your_seat}
        matchId={null}
        errorBanner={null}
        matchOver={result}
        players={players}
        spectator
        battleLog={ready?.battleLog}
        waiting={ready ? undefined : { status: `Rebuilding the game… ${Math.round(replay.phase === "building" ? replay.progress * 100 : 100)}%` }}
        leaveLabel="Exit replay"
        replay={ready ? { controls: <ReplayControls state={ready.controls} actions={ready.actions} note={replayNote(status, ready.atEnd, matchId)} reserveRow={payload.replay.end != null} />, quiet: ready.quiet } : undefined}
        onSendIntent={() => undefined}
        onLeave={() => navigate("/history")}
        onClearError={() => undefined}
      />
    </div>
  );
}

export default function ReplayPage() {
  const { matchId = "" } = useParams();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    fetchMatchReplay(matchId)
      .then((payload) => live && setLoad({ status: "ready", payload }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ReplayLoadError) setLoad({ status: "failed", reason: e.reason, message: e.message });
        else setLoad({ status: "failed", reason: "error", message: "Could not load this replay" });
      });
    return () => {
      live = false;
    };
  }, [matchId]);

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
          waiting={{ status: "Loading the recording…" }}
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
