/**
 * The game review (#967) as the replay page shows it, as pure logic over a `GameReview` so it is easy to test.
 * Engine-free on purpose (types and the class table only): the worker is what carries the engine.
 *
 * Step convention: the state before intent `m.step` is the position that was judged, so the move is the one that
 * led to replay step `m.step + 1`, and the badge shows while the scrubber is there.
 */
import type { GameReview, ReviewedMove, TurnSummary } from "@optcg/rules/gameReview";
import { CLASS_SEVERITY, MOVE_CLASSES, type MoveClass } from "@optcg/rules/review/classify";

export type Seat = 0 | 1;
export { MOVE_CLASSES, type MoveClass };
export type { GameReview, ReviewedMove };

export const CLASS_LABEL: Record<MoveClass, string> = {
  best: "Best",
  great: "Great",
  excellent: "Excellent",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

/** What the review's result says about the position now: the move that led here, or why there is none. */
export type MoveStatus =
  | { kind: "move"; move: ReviewedMove }
  /** On a line of the viewer's own: the review grades the recording only. */
  | { kind: "line" }
  | { kind: "start" }
  /** The move was not reviewed because it was the only legal one. */
  | { kind: "forced" }
  /** The review has not got that far yet. */
  | { kind: "pending" }
  /** The review stopped before this move (the engine could not replay it). */
  | { kind: "stopped" };

export type ReviewProgress = { done: boolean; progress: number };

/** The move that led to `step` on the recording, or why nothing is shown. Nothing is graded on a line of the viewer's own. */
export function moveStatus(review: GameReview | null, run: ReviewProgress, step: number, onBranch: boolean, total: number): MoveStatus {
  if (onBranch) return { kind: "line" };
  if (step <= 0) return { kind: "start" };
  const move = review?.moves.find((m) => m.step === step - 1);
  if (move) return { kind: "move", move };
  if (review?.diverged && step - 1 >= review.diverged.atIntent) return { kind: "stopped" };
  if (!run.done && step - 1 >= Math.floor(run.progress * total)) return { kind: "pending" };
  return { kind: "forced" };
}

/** The seat's win chance (points) at `step`: the latest turn-start estimate at or before it. */
export function winAt(review: GameReview | null, step: number, seat: Seat): number | null {
  if (!review) return null;
  let found: number | null = null;
  for (const e of review.evals) {
    if (e.step > step) break;
    found = e.win[seat];
  }
  return found;
}

/** What "Show best" opens: a line from the position the move was made in, with the best move already played. */
export function showBestRequest(move: ReviewedMove): { step: number; moves: { seat: Seat; intent: ReviewedMove["best"]["intent"] }[] } {
  return { step: move.step, moves: [{ seat: move.seat, intent: move.best.intent }] };
}

/** Classes that get a tick on the scrubber: the moments worth going to. */
export const TICK_CLASSES: readonly MoveClass[] = ["great", "inaccuracy", "mistake", "blunder"];

export type Tick = { step: number; frac: number; cls: MoveClass; seat: Seat };

/** Scrubber ticks for every moment worth going to, both players', at the step the move leads to (0..1 along the track). */
export function reviewTicks(review: GameReview | null, total: number): Tick[] {
  if (!review || total <= 0) return [];
  const ticks: Tick[] = [];
  for (const m of review.moves) {
    if (!m.cls || !TICK_CLASSES.includes(m.cls)) continue;
    const step = Math.min(m.step + 1, total);
    ticks.push({ step, frac: step / total, cls: m.cls, seat: m.seat });
  }
  return ticks;
}

export type TurnMark = "good" | "mistake";

/** The viewer's own turns worth a mark in the turn list: a good turn, or one with a mistake or blunder. */
export function turnMarks(review: GameReview | null, seat: Seat): Map<number, TurnMark> {
  const marks = new Map<number, TurnMark>();
  if (!review) return marks;
  for (const t of review.turns) {
    if (t.seat !== seat || !t.active) continue;
    if (t.worstClass && CLASS_SEVERITY[t.worstClass] >= CLASS_SEVERITY.mistake) marks.set(t.turn, "mistake");
    else if (t.goodTurn) marks.set(t.turn, "good");
  }
  return marks;
}

export type KeyMoment =
  | { kind: "move"; step: number; cls: "great" | "mistake" | "blunder"; seat: Seat; turn: number; move: ReviewedMove }
  | { kind: "goodTurn"; step: number; seat: Seat; turn: number; gain: number | null };

const KEY_CLASSES: readonly MoveClass[] = ["great", "mistake", "blunder"];

/**
 * Blunders, mistakes, great moves and good turns of both players, in the order they happened.
 * `step` is where "go there" lands: after the move, or at the start of the good turn.
 */
export function keyMoments(review: GameReview | null): KeyMoment[] {
  if (!review) return [];
  const out: KeyMoment[] = [];
  for (const m of review.moves) {
    if (m.cls && KEY_CLASSES.includes(m.cls)) out.push({ kind: "move", step: m.step + 1, cls: m.cls as "great" | "mistake" | "blunder", seat: m.seat, turn: m.turn, move: m });
  }
  for (const t of review.turns as TurnSummary[]) {
    if (!t.active || !t.goodTurn) continue;
    const start = review.evals.find((e) => !e.final && e.turn === t.turn && e.activeSeat === t.seat);
    if (start) out.push({ kind: "goodTurn", step: start.step, seat: t.seat, turn: t.turn, gain: t.gain });
  }
  // Moves before a good turn that starts on the same step.
  return out.sort((a, b) => a.step - b.step || Number(a.kind === "goodTurn") - Number(b.kind === "goodTurn"));
}

/** Percent for display: whole numbers, never "-0". */
export function pct(n: number): string {
  return `${Math.round(Math.min(100, Math.max(0, n)))}%`;
}

/** A class's count in the summary table's row order. */
export function summaryRows(review: GameReview | null): { cls: MoveClass; counts: [number, number] }[] {
  return MOVE_CLASSES.map((cls) => ({ cls, counts: [review?.seats[0].counts[cls] ?? 0, review?.seats[1].counts[cls] ?? 0] as [number, number] }));
}
