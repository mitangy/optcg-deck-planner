import { describe, expect, it } from "vitest";
import { keyMoments, moveStatus, reviewTicks, showBestRequest, turnLabel, turnMarks, winAt, type GameReview, type MoveClass, type ReviewedMove, type Seat } from "./reviewModel";

const intent = (n: number) => ({ type: "pass", n }) as unknown as ReviewedMove["played"]["intent"];
const move = (step: number, seat: Seat, turn: number, cls: MoveClass | null, extra: Partial<ReviewedMove> = {}): ReviewedMove => ({
  step,
  seat,
  turn,
  played: { intent: intent(step), label: `played ${step}` },
  best: { intent: intent(1000 + step), label: `best ${step}` },
  playedWin: 40,
  bestWin: 60,
  loss: 20,
  cls,
  score: 50,
  options: 3,
  ...extra,
});
const counts = (): Record<MoveClass, number> => ({ best: 0, great: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 });
const seatSummary = { counts: counts(), graded: 0, unranked: 0, accuracy: null };
const review = (over: Partial<GameReview> = {}): GameReview => ({ moves: [], evals: [], turns: [], seats: [seatSummary, seatSummary], forced: 0, ...over });
const DONE = { done: true, progress: 1 };

describe("moveStatus", () => {
  const r = review({ moves: [move(4, 0, 2, "mistake"), move(9, 1, 3, "best")] });
  it("shows the move that led to the step, not the one made from it (#967)", () => {
    expect(moveStatus(r, DONE, 5, false, 20)).toEqual({ kind: "move", move: r.moves[0] });
    expect(moveStatus(r, DONE, 4, false, 20)).toEqual({ kind: "forced" });
    expect(moveStatus(r, DONE, 10, false, 20)).toEqual({ kind: "move", move: r.moves[1] });
  });
  it("shows no grade on a line of the viewer's own, even at a graded step (#967)", () => {
    expect(moveStatus(r, DONE, 5, true, 20)).toEqual({ kind: "line" });
  });
  it("says nothing was played before the first step (#967)", () => {
    expect(moveStatus(r, DONE, 0, false, 20)).toEqual({ kind: "start" });
  });
  it("is pending while the review has not reached the move, and forced once it has (#967)", () => {
    expect(moveStatus(review(), { done: false, progress: 0.25 }, 15, false, 20)).toEqual({ kind: "pending" });
    expect(moveStatus(review(), { done: false, progress: 0.25 }, 3, false, 20)).toEqual({ kind: "forced" });
  });
  it("says the review stopped when the engine could not replay the move (#967)", () => {
    expect(moveStatus(review({ diverged: { atIntent: 6, message: "x" } }), DONE, 8, false, 20)).toEqual({ kind: "stopped" });
    expect(moveStatus(review({ diverged: { atIntent: 6, message: "x" } }), DONE, 3, false, 20)).toEqual({ kind: "forced" });
  });
});

describe("winAt", () => {
  const r = review({
    evals: [
      { step: 0, turn: 1, activeSeat: 0, win: [50, 50] },
      { step: 10, turn: 2, activeSeat: 1, win: [30, 70] },
    ],
  });
  it("uses the latest estimate at or before the step, for the asked seat (#967)", () => {
    expect(winAt(r, 9, 0)).toBe(50);
    expect(winAt(r, 10, 0)).toBe(30);
    expect(winAt(r, 12, 1)).toBe(70);
  });
  it("has none without a review (#967)", () => {
    expect(winAt(null, 3, 0)).toBeNull();
  });
});

describe("showBestRequest", () => {
  it("plays the best intent for the mover from the position the move was made in (#967)", () => {
    const m = move(7, 1, 3, "blunder");
    expect(showBestRequest(m)).toEqual({ step: 7, moves: [{ seat: 1, intent: m.best.intent }] });
  });
});

describe("reviewTicks", () => {
  it("marks great moves and inaccuracies, mistakes and blunders of both players where the move leads to (#967)", () => {
    const r = review({ moves: [move(0, 0, 1, "best"), move(4, 0, 2, "mistake"), move(9, 1, 3, "great"), move(10, 1, 3, "good"), move(11, 0, 4, "excellent"), move(14, 1, 4, "inaccuracy"), move(18, 0, 5, "blunder")] });
    expect(reviewTicks(r, 20).map((t) => [t.step, t.cls, t.seat])).toEqual([
      [5, "mistake", 0],
      [10, "great", 1],
      [15, "inaccuracy", 1],
      [19, "blunder", 0],
    ]);
    expect(reviewTicks(r, 20)[0]!.frac).toBeCloseTo(5 / 20);
  });
  it("has none without a review or a game (#967)", () => {
    expect(reviewTicks(null, 20)).toEqual([]);
    expect(reviewTicks(review({ moves: [move(1, 0, 1, "blunder")] }), 0)).toEqual([]);
  });
});

describe("turnMarks", () => {
  const turns = (rows: [number, Seat, boolean, MoveClass | null, boolean][]) =>
    review({ turns: rows.map(([turn, seat, active, worstClass, goodTurn]) => ({ turn, seat, active, worstClass, decisions: 1, gain: 0, goodTurn })) });
  it("marks the viewer's own mistake and good turns, and not the other player's (#967)", () => {
    const r = turns([
      [1, 0, true, "blunder", false],
      [2, 1, true, "blunder", false],
      [3, 0, true, null, true],
      [5, 0, true, "inaccuracy", false],
      [7, 0, false, "mistake", false],
    ]);
    expect([...turnMarks(r, 0)]).toEqual([
      [1, "mistake"],
      [3, "good"],
    ]);
    expect([...turnMarks(r, 1)]).toEqual([[2, "mistake"]]);
  });
  it("calls a turn with a mistake a mistake even if it was also flagged good (#967)", () => {
    expect(turnMarks(turns([[1, 0, true, "mistake", true]]), 0).get(1)).toBe("mistake");
  });
});

describe("keyMoments", () => {
  const r = review({
    moves: [move(2, 0, 1, "inaccuracy"), move(5, 1, 2, "blunder"), move(8, 0, 3, "great"), move(12, 1, 4, "good"), move(15, 0, 5, "mistake"), move(16, 1, 5, "best")],
    evals: [
      { step: 0, turn: 1, activeSeat: 0, win: [50, 50] },
      { step: 7, turn: 3, activeSeat: 0, win: [55, 45] },
      { step: 20, turn: 5, activeSeat: 1, win: [55, 45], final: true },
    ],
    turns: [
      { turn: 3, seat: 0, active: true, worstClass: null, decisions: 2, gain: 12, goodTurn: true },
      { turn: 4, seat: 1, active: true, worstClass: null, decisions: 2, gain: 9, goodTurn: false },
    ],
  });
  it("lists blunders, mistakes, great moves and good turns of both players in the order they happened (#967)", () => {
    expect(keyMoments(r).map((m) => [m.kind, m.step, m.kind === "move" ? m.cls : "goodTurn"])).toEqual([
      ["move", 6, "blunder"],
      ["goodTurn", 7, "goodTurn"],
      ["move", 9, "great"],
      ["move", 16, "mistake"],
    ]);
  });
  it("is empty without a review (#967)", () => {
    expect(keyMoments(null)).toEqual([]);
  });
});

describe("turnLabel", () => {
  it("names the mulligan before the first turn, not a turn 0 (#986)", () => {
    expect(turnLabel(0)).toBe("Mulligan");
    expect(turnLabel(1)).toBe("T1");
    expect(turnLabel(14)).toBe("T14");
  });
});
