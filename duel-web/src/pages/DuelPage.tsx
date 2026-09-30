import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import type { BoardWaiting } from "../board/PendingBoard";
import { BountyAmount } from "../Bounty";
import { useDuelSession } from "../state/DuelSession";

export function DuelPage() {
  const navigate = useNavigate();
  const {
    launch,
    launching,
    queueing,
    connected,
    canReconnect,
    resuming,
    reconnecting,
    view,
    players,
    seat,
    matchId,
    errorBanner,
    matchOver,
    rating,
    sendIntent,
    reconnect,
    concede,
    leave,
    clearError,
    role,
    battleLog,
    timer,
    chat,
    sendChat,
    undo,
    sendUndo,
    awayUntil,
    seatSkins,
    rematch,
    sendRematch,
  } = useDuelSession();


  const leftRef = useRef(false);
  useEffect(() => {
    // Once only: the navigation is a transition, so this page can re-render
    // (clearError below) before it unmounts and would redirect again without the note.
    if (leftRef.current) return;
    if (!connected && !view && !canReconnect && !matchId && !resuming && !launching) {
      leftRef.current = true;
      // A request that failed before the match opened: say why back in the lobby.
      navigate("/", { replace: true, state: errorBanner ? { matchError: errorBanner } : null });
      if (errorBanner) clearError();
    }
  }, [connected, view, canReconnect, matchId, resuming, launching, errorBanner, clearError, navigate]);

  // Until the first view arrives the board is already up, empty, saying what it waits on.
  const waiting: BoardWaiting | undefined = view
    ? undefined
    : launching && launch
      ? { status: queueing ? "Searching for an opponent…" : launch.status, youLeaderId: launch.leaderId }
      : resuming
        ? { status: "Reconnecting to match…" }
        : {
            status: role === "spectator" ? "Waiting for the match to start…" : "Waiting for opponent…",
            youLeaderId: launch?.leaderId,
            invite:
              launch?.invite !== false && role === "player"
                ? { roomId: matchId, autoCopy: seat === 0 }
                : null,
          };
  return (
    <div className="duel-root">
      {!connected && canReconnect && view ? (
        <div className="reconnect-banner" role="status">
          <span>{reconnecting ? "Reconnecting to the match…" : "Disconnected from the match."}</span>
          <button
            type="button"
            disabled={reconnecting}
            onClick={async () => {
              try {
                await reconnect();
              } catch {
                clearError();
              }
            }}
          >
            Reconnect
          </button>
        </div>
      ) : null}
      {rating != null ? <div className="rating-chip">
          Your Bounty: <BountyAmount amount={rating} />
        </div> : null}
      <DuelBoard
        view={view}
        seat={seat}
        matchId={matchId}
        errorBanner={errorBanner}
        matchOver={matchOver}
        players={players}
        timer={timer}
        spectator={role === "spectator" || Boolean(view?.spectator)}
        battleLog={battleLog}
        chat={{ lines: chat, onSend: sendChat }}
        onConcede={connected && role === "player" ? () => concede() : undefined}
        undo={role === "player" ? { state: undo, onAction: sendUndo } : undefined}
        onSendIntent={sendIntent}
        rematch={role === "player" ? { state: rematch, onAction: sendRematch } : undefined}
        seatSkins={seatSkins}
        opponentAwayUntil={seat === 0 || seat === 1 ? awayUntil[seat === 0 ? 1 : 0] : null}
        waiting={waiting}
        leaveLabel={view ? undefined : "Cancel"}
        onLeave={() => {
          void leave();
          navigate("/", { replace: true });
        }}
        onClearError={clearError}
      />
    </div>
  );
}
