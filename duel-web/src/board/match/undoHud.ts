import type { Seat, UndoAction, UndoRequestOptions, UndoState } from "../../net/protocol";
import { undoForceable, undoRequestText } from "./undoMenu";

export type BoardUndo = {
  state: UndoState | null;
  onAction: (action: UndoAction, opts?: UndoRequestOptions) => void;
  autoAccept?: boolean;
  defaultOpen?: boolean;
};

export type UndoUi = ReturnType<typeof deriveUndoUi>;

export function deriveUndoUi(undo: BoardUndo | undefined, boardSeat: Seat) {
  const undoState = undo?.state ?? null;
  const undoPendingMine =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from === boardSeat;
  const undoPendingTheirs =
    undoState?.pending != null && !undo?.autoAccept && undoState.pending.from !== boardSeat;
  const undoReqText =
    undoPendingTheirs && undoState?.pending ? undoRequestText(undoState.pending, boardSeat) : null;
  const undoNothingYet = undoState != null && undoState.targetTurn == null && !undoForceable(undoState);
  return { undo, undoState, undoPendingMine, undoPendingTheirs, undoReqText, undoNothingYet };
}
