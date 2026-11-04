import { describe, expect, it } from "vitest";
import { backToGameStep, currentState, openBranch, playMove, undoMove, type Branch, type MoveApplier, type RecordedMove } from "./replayBranch";

// A toy game: the state is the list of moves made so far, a move named "bad" is illegal.
type S = string[];
type I = { type: string; n?: number; b?: number };
const apply: MoveApplier<S, I, string> = (state, seat, intent) =>
  intent.type === "bad" ? { ok: false, message: "not allowed" } : { ok: true, state: [...state, `${seat}:${intent.type}`], events: [`${seat}:${intent.type}`] };

const recorded: RecordedMove<I>[] = [
  { seat: 0, intent: { type: "a" } },
  { seat: 1, intent: { type: "b", n: 1, b: 2 } },
  { seat: 0, intent: { type: "c" } },
];
const mainAt = (step: number): S => recorded.slice(0, step).map((m) => `${m.seat}:${m.intent.type}`);
const at = (step: number, branch: Branch<S, I, string> | null = null) => ({ step, branch, mainState: mainAt(step), recorded });

describe("playing a different line on a replay (#966)", () => {
  it("the move that was played just advances the main line (#966)", () => {
    expect(playMove(at(1), { seat: 1, intent: { b: 2, n: 1, type: "b" } }, apply)).toEqual({ kind: "advance", step: 2 });
  });

  it("the same intent from the other seat is a different move and branches (#966)", () => {
    const out = playMove(at(0), { seat: 1, intent: { type: "a" } }, apply);
    expect(out.kind).toBe("branch");
  });

  it("a different move branches from the step it was made at, keeping the state before it (#966)", () => {
    const out = playMove(at(2), { seat: 0, intent: { type: "z" } }, apply);
    if (out.kind !== "branch") throw new Error(out.kind);
    expect(out.branch.fromStep).toBe(2);
    expect(out.branch.states).toEqual([mainAt(2), [...mainAt(2), "0:z"]]);
    expect(out.branch.moves).toEqual([{ seat: 0, intent: { type: "z" }, events: ["0:z"] }]);
  });

  it("further moves extend the branch from its last state, even the recorded move (#966)", () => {
    const first = playMove(at(1), { seat: 1, intent: { type: "z" } }, apply);
    if (first.kind !== "branch") throw new Error(first.kind);
    const second = playMove(at(1, first.branch), { seat: 1, intent: { type: "b", n: 1, b: 2 } }, apply);
    if (second.kind !== "branch") throw new Error(second.kind);
    expect(second.branch.fromStep).toBe(1);
    expect(second.branch.moves.map((m) => m.intent.type)).toEqual(["z", "b"]);
    expect(second.branch.states).toHaveLength(3);
    expect(currentState(mainAt(1), second.branch)).toEqual([...mainAt(1), "1:z", "1:b"]);
  });

  it("an illegal move changes nothing and says why (#966)", () => {
    expect(playMove(at(1), { seat: 1, intent: { type: "bad" } }, apply)).toEqual({ kind: "illegal", message: "not allowed" });
  });

  it("past the last recorded move any move branches rather than advancing (#966)", () => {
    const out = playMove(at(3), { seat: 1, intent: { type: "z" } }, apply);
    expect(out.kind).toBe("branch");
  });

  it("undo takes back the last move, and the only move drops the branch (#966)", () => {
    const first = playMove(at(2), { seat: 0, intent: { type: "x" } }, apply);
    if (first.kind !== "branch") throw new Error(first.kind);
    const second = playMove(at(2, first.branch), { seat: 0, intent: { type: "y" } }, apply);
    if (second.kind !== "branch") throw new Error(second.kind);
    const undone = undoMove(second.branch);
    expect(undone).toEqual(first.branch);
    expect(undoMove(first.branch)).toBeNull();
  });

  it("back to game returns to the step the line left (#966)", () => {
    const out = playMove(at(2), { seat: 0, intent: { type: "x" } }, apply);
    if (out.kind !== "branch") throw new Error(out.kind);
    expect(backToGameStep(out.branch)).toBe(2);
  });

  it("opening a line with moves already played applies them in order, and refuses a bad one (#966)", () => {
    const moves: RecordedMove<I>[] = [
      { seat: 0, intent: { type: "x" } },
      { seat: 1, intent: { type: "y" } },
    ];
    const ok = openBranch(2, mainAt(2), moves, apply);
    if (!ok.ok) throw new Error(ok.message);
    expect(ok.branch.fromStep).toBe(2);
    expect(currentState(mainAt(2), ok.branch)).toEqual([...mainAt(2), "0:x", "1:y"]);
    expect(openBranch(2, mainAt(2), [moves[0]!, { seat: 1, intent: { type: "bad" } }], apply)).toEqual({ ok: false, message: "not allowed" });
    expect(openBranch(2, mainAt(2), [], apply).ok).toBe(false);
  });
});
