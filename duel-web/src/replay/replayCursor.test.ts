import { describe, expect, it } from "vitest";
import { buildReplayTimeline, timelineStateAt, type MatchReplay } from "@optcg/rules/replayTimeline";
import fixture from "../../e2e/data/replay-purple-red.json";
import { createReplayCursor, nextTurnStep, prevTurnStep, turnAtStep } from "./replayCursor";

const timeline = buildReplayTimeline(fixture.replay as unknown as MatchReplay, { every: 4 });

describe("moving around a replay", () => {
  it("step back past a checkpoint lands on the previous step (#476)", () => {
    const cursor = createReplayCursor(timeline);
    for (let s = 0; s <= 10; s++) cursor.stateAt(s);
    // Back across the checkpoint at step 8 and the one at 4: each step is that step's own state, not a neighbour's.
    for (let s = 10; s >= 0; s--) expect(cursor.stateAt(s)).toEqual(timelineStateAt(timeline, s));
    // And a jump forward from there still lands exactly.
    expect(cursor.stateAt(37)).toEqual(timelineStateAt(timeline, 37));
    // A step not seen yet, with a later one remembered: it is built from an earlier state, never the later one.
    expect(cursor.stateAt(30)).toEqual(timelineStateAt(timeline, 30));
    expect(cursor.stateAt(21)).toEqual(timelineStateAt(timeline, 21));
  });

  it("next turn jumps to the following turn's first step (#476)", () => {
    const starts = timeline.turnStarts;
    expect(starts.length).toBeGreaterThan(3);
    for (let i = 0; i < starts.length - 1; i++) {
      const here = starts[i]!.step;
      const next = starts[i + 1]!.step;
      expect(nextTurnStep(timeline, here)).toBe(next);
      expect(nextTurnStep(timeline, next - 1)).toBe(next);
    }
    expect(nextTurnStep(timeline, starts.at(-1)!.step)).toBe(timeline.steps.length);
  });

  it("previous turn goes to the start of this turn, then the one before (#476)", () => {
    const starts = timeline.turnStarts;
    for (let i = 1; i < starts.length; i++) {
      const here = starts[i]!.step;
      expect(prevTurnStep(timeline, here)).toBe(starts[i - 1]!.step);
      expect(prevTurnStep(timeline, here + 1)).toBe(here);
    }
    expect(prevTurnStep(timeline, 0)).toBe(0);
  });

  it("the turn shown for a step is the turn the engine is in (#476)", () => {
    for (let s = 0; s <= timeline.steps.length; s += 3) expect(turnAtStep(timeline, s)).toBe(timelineStateAt(timeline, s).turnNumber);
  });
});
