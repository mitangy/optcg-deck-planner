import type { GameReview, ReviewedMove, TurnSummary } from "@optcg/rules/review/gameReview";
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

export type MoveStatus =
  | { kind: "move"; move: ReviewedMove }
  | { kind: "line" }
  | { kind: "start" }
  | { kind: "forced" }
  | { kind: "pending" }
  | { kind: "stopped" };

export type ReviewProgress = { done: boolean; progress: number };

export function moveStatus(review: GameReview | null, run: ReviewProgress, step: number, onBranch: boolean, total: number): MoveStatus {
  if (onBranch) return { kind: "line" };
  if (step <= 0) return { kind: "start" };
  const move = review?.moves.find((m) => m.step === step - 1);
  if (move) return { kind: "move", move };
  if (review?.diverged && step - 1 >= review.diverged.atIntent) return { kind: "stopped" };
  if (!run.done && step - 1 >= Math.floor(run.progress * total)) return { kind: "pending" };
  return { kind: "forced" };
}

export function winAt(review: GameReview | null, step: number, seat: Seat): number | null {
  if (!review) return null;
  let found: number | null = null;
  for (const e of review.evals) {
    if (e.step > step) break;
    found = e.win[seat];
  }
  return found;
}

export function showBestRequest(move: ReviewedMove): { step: number; moves: { seat: Seat; intent: ReviewedMove["best"]["intent"] }[] } {
  return { step: move.step, moves: [{ seat: move.seat, intent: move.best.intent }] };
}

export const TICK_CLASSES: readonly MoveClass[] = ["great", "inaccuracy", "mistake", "blunder"];

export type Tick = { step: number; frac: number; cls: MoveClass; seat: Seat };

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
  return out.sort((a, b) => a.step - b.step || Number(a.kind === "goodTurn") - Number(b.kind === "goodTurn"));
}

export function turnLabel(turn: number): string {
  return turn < 1 ? "Mulligan" : `T${turn}`;
}

export function pct(n: number): string {
  return `${Math.round(Math.min(100, Math.max(0, n)))}%`;
}

export function summaryRows(review: GameReview | null): { cls: MoveClass; counts: [number, number] }[] {
  return MOVE_CLASSES.map((cls) => ({ cls, counts: [review?.seats[0].counts[cls] ?? 0, review?.seats[1].counts[cls] ?? 0] as [number, number] }));
}
