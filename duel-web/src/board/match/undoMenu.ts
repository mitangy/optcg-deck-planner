import type { Seat, UndoOption, UndoPending, UndoRequestOptions, UndoState } from "../../net/protocol";

export type UndoMenuItem = {
  key: string;
  request: UndoRequestOptions;
  label: string;
  reason?: string;
  disabled: boolean;
  warn: boolean;
};

export type UndoMenuModel = {
  items: UndoMenuItem[];
  reason: string | null;
};

const NOTHING = "Nothing to undo yet";

export function undoBlocked(state: UndoState): boolean {
  return state.targetTurn == null || state.blockedReason != null;
}

// So the button must stay clickable.
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

export function undoMenuModel(state: UndoState): UndoMenuModel {
  const o = state.options;
  if (state.targetTurn == null) return { items: [], reason: state.blockedReason ?? NOTHING };
  const lastLabel = state.action ? `Last action: ${state.action.label}` : "Last action";
  if (!o) return { items: [{ key: "action", request: { scope: "action" }, label: lastLabel, disabled: false, warn: false }], reason: null };
  const items = rowsFor(o.action, "action", lastLabel, "Force undo last action");
  // "Whole turn" differs from the last action only when the turn took more than one action (or history ran out).
  if (o.turn.steps > o.action.steps || (o.action.steps > 0 && o.turn.steps === 0)) {
    const label = o.turn.steps > 1 ? `Whole turn (${o.turn.steps} actions)` : "Whole turn";
    items.push(...rowsFor(o.turn, "turn", label, "Force undo whole turn"));
  }
  return { items, reason: null };
}

export function undoButtonTitle(state: UndoState, autoAccept: boolean): string {
  if (undoBlocked(state)) {
    const why = state.blockedReason ?? NOTHING;
    return undoForceable(state) ? `${why}. Open the menu to force it.` : why;
  }
  const what = state.action ? `Undo: ${state.action.label}` : "Undo the last action";
  return autoAccept ? what : `${what} (your opponent must accept)`;
}

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
