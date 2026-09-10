import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import { useDuelSession } from "../state/DuelSession";

export function DuelPage() {
  const navigate = useNavigate();
  const {
    connected,
    canReconnect,
    resuming,
    view,
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
  } = useDuelSession();

  useEffect(() => {
    if (!connected && !view && !canReconnect && !matchId && !resuming) {
      navigate("/", { replace: true });
    }
  }, [connected, view, canReconnect, matchId, resuming, navigate]);

  if (resuming && !view) {
    return (
      <div className="duel-root">
        <div className="loading arena-loading">Reconnecting to match…</div>
      </div>
    );
  }
  return (
    <div className="duel-root">
      {!connected && canReconnect && view ? (
        <div className="reconnect-banner">
          <span>Disconnected — reconnect within grace window</span>
          <button
            type="button"
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
      {rating != null ? <div className="rating-chip">Your rating: {rating}</div> : null}
      <DuelBoard
        view={view}
        seat={seat}
        matchId={matchId}
        errorBanner={errorBanner}
        matchOver={matchOver}
        spectator={role === "spectator" || Boolean(view?.spectator)}
        onSendIntent={sendIntent}
        onLeave={async () => {
          await leave();
          navigate("/", { replace: true });
        }}
        onClearError={clearError}
      />
      {connected && view && !matchOver && role === "player" ? (
        <button type="button" className="concede-fab" onClick={() => concede()}>
          Concede
        </button>
      ) : null}
    </div>
  );
}
