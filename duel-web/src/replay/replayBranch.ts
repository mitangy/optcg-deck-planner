/**
 * "Try a different line" on a replay (#966), as pure logic over any state type so it is easy to test.
 *
 * The board is live at every step. A move the viewer makes is either the move that was played (the main line
 * just advances) or a different one, which starts a branch: the game as it would have gone, kept beside the
 * recording and never written into it.
 *
 *   Branch = { fromStep, states, moves }
 *     fromStep  the main-line step the branch left (the state before the first branch move)
 *     states    states[0] is the main line's state at fromStep; states[k] is the state after k branch moves,
 *               so states.length === moves.length + 1
 *     moves     what was played on the branch, in order, with the events each produced (for the log)
 *
 * A branch always holds at least one move: undoing the last one drops the branch, back on the main line.
 */
import { stableJson } from "@optcg/rules/review/classify";

export type Seat = 0 | 1;

export type BranchMove<I, E> = { seat: Seat; intent: I; events: E[] };

export type Branch<S, I, E> = { fromStep: number; states: S[]; moves: BranchMove<I, E>[] };

export type RecordedMove<I> = { seat: Seat; intent: I };

export type ApplyResult<S, E> = { ok: true; state: S; events: E[] } | { ok: false; message: string };

export type MoveApplier<S, I, E> = (state: S, seat: Seat, intent: I) => ApplyResult<S, E>;

/** The state the board shows: the branch's last state, or the main line's state at the step. */
export function currentState<S, I, E>(mainState: S, branch: Branch<S, I, E> | null): S {
  return branch ? branch.states[branch.states.length - 1]! : mainState;
}

/** True when `a` and `b` are the same move by the same seat (intents compared by content, key order aside). */
export function sameMove<I>(a: RecordedMove<I> | undefined, b: RecordedMove<I>): boolean {
  return a !== undefined && a.seat === b.seat && stableJson(a.intent) === stableJson(b.intent);
}

export type MoveOutcome<S, I, E> =
  | { kind: "advance"; step: number }
  | { kind: "branch"; branch: Branch<S, I, E> }
  | { kind: "illegal"; message: string };

/**
 * What a move the viewer sent does.
 * - Off a branch, at a step before the end, the recorded move itself: the main line advances one step.
 * - Anything else the engine accepts: starts a branch at `step`, or extends the one already open.
 *   (On a branch even the recorded move extends it: a branch never rejoins the recording.)
 * - Anything the engine refuses: `illegal`, and nothing changes.
 */
export function playMove<S, I, E>(
  at: { step: number; branch: Branch<S, I, E> | null; mainState: S; recorded: readonly RecordedMove<I>[] },
  move: RecordedMove<I>,
  apply: MoveApplier<S, I, E>,
): MoveOutcome<S, I, E> {
  const { step, branch, mainState, recorded } = at;
  if (!branch && step < recorded.length && sameMove(recorded[step], move)) return { kind: "advance", step: step + 1 };
  const applied = apply(currentState(mainState, branch), move.seat, move.intent);
  if (!applied.ok) return { kind: "illegal", message: applied.message };
  const played: BranchMove<I, E> = { seat: move.seat, intent: move.intent, events: applied.events };
  if (!branch) return { kind: "branch", branch: { fromStep: step, states: [mainState, applied.state], moves: [played] } };
  return { kind: "branch", branch: { fromStep: branch.fromStep, states: [...branch.states, applied.state], moves: [...branch.moves, played] } };
}

/** Take back the branch's last move. Returns null when that was its only move: no branch is left. */
export function undoMove<S, I, E>(branch: Branch<S, I, E>): Branch<S, I, E> | null {
  if (branch.moves.length <= 1) return null;
  return { fromStep: branch.fromStep, states: branch.states.slice(0, -1), moves: branch.moves.slice(0, -1) };
}

/** The main-line step "Back to game" returns to. */
export function backToGameStep<S, I, E>(branch: Branch<S, I, E>): number {
  return branch.fromStep;
}

/**
 * A branch with `moves` already played from `startState` (the main line's state at `fromStep`), for opening one
 * programmatically, for instance with the best move played. Stops at the first move the engine refuses and says so.
 */
export function openBranch<S, I, E>(
  fromStep: number,
  startState: S,
  moves: readonly RecordedMove<I>[],
  apply: MoveApplier<S, I, E>,
): { ok: true; branch: Branch<S, I, E> } | { ok: false; message: string } {
  if (moves.length === 0) return { ok: false, message: "No move to play" };
  const states = [startState];
  const played: BranchMove<I, E>[] = [];
  for (const move of moves) {
    const applied = apply(states[states.length - 1]!, move.seat, move.intent);
    if (!applied.ok) return { ok: false, message: applied.message };
    states.push(applied.state);
    played.push({ seat: move.seat, intent: move.intent, events: applied.events });
  }
  return { ok: true, branch: { fromStep, states, moves: played } };
}
