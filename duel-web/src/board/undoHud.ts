import type { Seat, UndoAction, UndoRequestOptions, UndoState } from "../net/protocol";
import { undoForceable, undoRequestText } from "./undoMenu";

/**
 * Turn undo (private rooms / practice). `autoAccept` = the other seat is
 * also this player (practice), so no request / answer UI is shown.
 */
export type BoardUndo = {
  state: UndoState | null;
  onAction: (action: UndoAction, opts?: UndoRequestOptions) => void;
  autoAccept?: boolean;
  /** Open the choice menu on mount (demo screenshots). */
  defaultOpen?: boolean;
};

/** What the board's undo UI needs to know, from the undo prop and who is asking. */
export type UndoUi = ReturnType<typeof deriveUndoUi>;

export function deriveUndoUi(undo: BoardUndo | undefined, boardSeat: Seat) {
  const undoState = undo?.state ?? null;
  const undoPendingMine =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from === boardSeat;
  const undoPendingTheirs =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from !== boardSeat;
  // The Undo button opens a menu: the last action (by either seat) or the whole turn (#497, #536).
  const undoReqText =
    undoPendingTheirs && undoState?.pending ? undoRequestText(undoState.pending, boardSeat) : null;
  const undoNothingYet = undoState != null && undoState.targetTurn == null && !undoForceable(undoState);
  return { undo, undoState, undoPendingMine, undoPendingTheirs, undoReqText, undoNothingYet };
}
