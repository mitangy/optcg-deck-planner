import type { Seat, UndoOption, UndoPending, UndoRequestOptions, UndoState } from "../net/protocol";

/** One row of the undo menu: a request the player can send, or a blocked one with its reason (#536). */
export type UndoMenuItem = {
  key: string;
  /** What choosing it asks for; ignored while `disabled`. */
  request: UndoRequestOptions;
  label: string;
  /** Why it cannot be chosen (disabled rows). */
  reason?: string;
  disabled: boolean;
  /** A forced request past a reveal: styled as a warning. */
  warn: boolean;
};

export type UndoMenuModel = {
  items: UndoMenuItem[];
  /** Shown instead of rows when there is nothing to choose. */
  reason: string | null;
};

const NOTHING = "Nothing to undo yet";

/** True when no scope can be requested plainly right now (the button looks dimmed and its hover says why). */
export function undoBlocked(state: UndoState): boolean {
  return state.targetTurn == null || state.blockedReason != null;
}

/** True when a forced request could still go through (so the button must stay clickable). */
export function undoForceable(state: UndoState): boolean {
  return state.options?.action.forceable === true || state.options?.turn.forceable === true;
}

function rowsFor(
  opt: UndoOption,
  scope: "action" | "turn",
  label: string,
  forceLabel: string,
): UndoMenuItem[] {
  if (opt.available) return [{ key: scope, request: { scope }, label, disabled: false, warn: false }];
  const rows: UndoMenuItem[] = [
    { key: scope, request: { scope }, label, reason: opt.blockedReason ?? NOTHING, disabled: true, warn: false },
  ];
  if (opt.forceable) {
    rows.push({ key: `${scope}-force`, request: { scope, force: true }, label: forceLabel, disabled: false, warn: true });
  }
  return rows;
}

/** The rows of the undo menu for the server's current undo state. */
export function undoMenuModel(state: UndoState): UndoMenuModel {
  const o = state.options;
  if (state.targetTurn == null) return { items: [], reason: state.blockedReason ?? NOTHING };
  const lastLabel = state.action ? `Last action: ${state.action.label}` : "Last action";
  // An older server reports no per-scope options: only the last action can be taken back.
  if (!o) return { items: [{ key: "action", request: { scope: "action" }, label: lastLabel, disabled: false, warn: false }], reason: null };
  const items = rowsFor(o.action, "action", lastLabel, "Force undo last action");
  // "Whole turn" differs from the last action only when the turn took more than one action (or history ran out).
  if (o.turn.steps > o.action.steps || (o.action.steps > 0 && o.turn.steps === 0)) {
    const label = o.turn.steps > 1 ? `Whole turn (${o.turn.steps} actions)` : "Whole turn";
    items.push(...rowsFor(o.turn, "turn", label, "Force undo whole turn"));
  }
  return { items, reason: null };
}

/** Hover text of the undo button: why it is blocked, or what it would take back. */
export function undoButtonTitle(state: UndoState, autoAccept: boolean): string {
  if (undoBlocked(state)) {
    const why = state.blockedReason ?? NOTHING;
    return undoForceable(state) ? `${why}. Open the menu to force it.` : why;
  }
  const what = state.action ? `Undo: ${state.action.label}` : "Undo the last action";
  return autoAccept ? what : `${what} (your opponent must accept)`;
}

/** The opponent's dialog: what is asked, and the warning when it was forced past a reveal. */
export function undoRequestText(
  pending: UndoPending,
  boardSeat: Seat,
): { what: string; warning: string | null } {
  const whose = pending.action?.seat === boardSeat ? "your" : "their";
  const what =
    pending.scope === "turn"
      ? `undo ${whose} whole turn${pending.steps > 1 ? ` (${pending.steps} actions)` : ""}`
      : `undo ${whose} last action${pending.action ? `: ${pending.action.label}` : ""}`;
  const warning = pending.force
    ? `Cards were revealed${pending.revealReason ? ` (${pending.revealReason})` : ""}. Undoing lets them redo it.`
    : null;
  return { what, warning };
}
