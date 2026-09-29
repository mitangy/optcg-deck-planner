import type { RematchAction, RematchState, Seat, SeatPlayers } from "../net/protocol";
import { seatLabel, seatName } from "./playerNames";

type Props = {
  state: RematchState | null;
  mySeat: Seat;
  players: SeatPlayers | null;
  /** Practice: both seats are this player (agree from both; name seats). */
  autoAccept?: boolean;
  onAction: (action: RematchAction) => void;
};

/**
 * Match-over rematch vote: both players agree, then the loser picks whether
 * to go first or second and a fresh game starts in the same room.
 */
export function RematchPanel({ state, mySeat, players, autoAccept = false, onAction }: Props) {
  if (!state) return null;
  const oppSeat: Seat = mySeat === 0 ? 1 : 0;
  const oppName = seatName(players, oppSeat) ?? "Your opponent";

  if (!state.available) {
    return <p className="rematch-note">{oppName} left — a rematch isn&apos;t available.</p>;
  }

  if (state.chooser != null) {
    if (autoAccept || state.chooser === mySeat) {
      return (
        <div className="rematch-panel" role="group" aria-label="Choose turn order">
          <p className="rematch-note">
            <strong>
              {autoAccept ? `${seatLabel(players, state.chooser)} lost` : "You lost"}
            </strong>{" "}
            — pick the turn order for the rematch.
          </p>
          <div className="rematch-actions">
            <button type="button" className="btn btn-primary" onClick={() => onAction("first")}>
              Go first
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onAction("second")}>
              Go second
            </button>
          </div>
        </div>
      );
    }
    return <p className="rematch-note">Rematch on! {oppName} is choosing who goes first…</p>;
  }

  const mine = state.requested[mySeat];
  const theirs = state.requested[oppSeat];

  if (mine && !theirs) {
    return (
      <div className="rematch-panel">
        <p className="rematch-note">Waiting for {oppName} to accept the rematch…</p>
        <div className="rematch-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onAction("decline")}>
            Cancel request
          </button>
        </div>
      </div>
    );
  }

  if (theirs && !mine) {
    return (
      <div className="rematch-panel">
        <p className="rematch-note">
          <strong>{oppName} wants a rematch!</strong>
        </p>
        <div className="rematch-actions">
          <button type="button" className="btn btn-primary" onClick={() => onAction("request")}>
            Accept rematch
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onAction("decline")}>
            No thanks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rematch-panel">
      {state.declinedBy === oppSeat && !autoAccept ? (
        <p className="rematch-note">{oppName} declined the rematch.</p>
      ) : null}
      <div className="rematch-actions">
        <button type="button" className="btn btn-primary" onClick={() => onAction("request")}>
          {autoAccept ? "Rematch" : "Ask for a rematch"}
        </button>
      </div>
    </div>
  );
}
