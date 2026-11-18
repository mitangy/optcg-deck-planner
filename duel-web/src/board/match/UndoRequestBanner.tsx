import type { SeatPlayers } from "../../net/protocol";
import { seatName } from "./playerNames";
import type { UndoUi } from "./undoHud";

export function UndoRequestBanner({ ui, players }: { ui: UndoUi; players: SeatPlayers | null }) {
  const { undo, undoState, undoPendingTheirs, undoReqText } = ui;
  if (!(undoPendingTheirs && undoState?.pending)) return null;
  return (
    <div className="undo-request" role="alertdialog" aria-label="Undo request">
      <p>
        <strong>{seatName(players, undoState.pending.from) ?? "Your opponent"}</strong> wants to{" "}
        {undoReqText?.what}.
      </p>
      {undoReqText?.warning ? (
        <p className="undo-request-warn" role="note">
          {undoReqText.warning}
        </p>
      ) : null}
      <div className="undo-request-actions">
        <button type="button" className="btn btn-primary" onClick={() => undo?.onAction("accept", { id: undoState.pending?.id })}>
          Allow
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => undo?.onAction("decline")}>
          Decline
        </button>
      </div>
    </div>
  );
}
