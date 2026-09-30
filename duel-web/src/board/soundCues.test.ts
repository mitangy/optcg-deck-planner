import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "./battleLog";
import type { MotionCue } from "./motionCues";
import { lifeDamageCue, opponentPlayCueDue } from "./soundCues";

const log = (...ids: string[]): BattleLogEntry[] =>
  ids.map((id) => ({ id, turn: 1, text: "x", tone: "play", important: false, segments: [] }));

describe("opponentPlayCueDue", () => {
  it("is silent on first mount, even with a play already in the log", () => {
    expect(opponentPlayCueDue(undefined, "b", log("a", "b"))).toBe(false);
  });

  it("fires when a newer play follows one already seen", () => {
    expect(opponentPlayCueDue("a", "b", log("a", "b"))).toBe(true);
  });

  it("fires for the first play after a play-less start", () => {
    expect(opponentPlayCueDue(null, "a", log("a"))).toBe(true);
  });

  it("does not repeat for the same play", () => {
    expect(opponentPlayCueDue("b", "b", log("a", "b"))).toBe(false);
  });

  it("is silent when the log was replaced and the old play is gone", () => {
    expect(opponentPlayCueDue("a", "z", log("y", "z"))).toBe(false);
  });

  it("is silent when there is no play", () => {
    expect(opponentPlayCueDue("a", null, log("a"))).toBe(false);
  });
});

describe("lifeDamageCue", () => {
  const lost = (side: "you" | "opp"): MotionCue => ({ kind: "life_lost", side, count: 1 });
  const gained = (side: "you" | "opp"): MotionCue => ({ kind: "life_gained", side, count: 1 });

  it("gives the heavy cue when you lose Life", () => {
    expect(lifeDamageCue([lost("you")], false)).toBe("you");
  });

  it("gives the soft cue when only the opponent loses Life", () => {
    expect(lifeDamageCue([lost("opp")], false)).toBe("opp");
  });

  it("prefers your loss when both lose Life", () => {
    expect(lifeDamageCue([lost("opp"), lost("you")], false)).toBe("you");
  });

  it("never treats a spectated seat as 'you'", () => {
    expect(lifeDamageCue([lost("you")], true)).toBeNull();
    expect(lifeDamageCue([lost("you"), lost("opp")], true)).toBe("opp");
  });

  it("ignores Life gains and unrelated cues", () => {
    expect(lifeDamageCue([gained("you"), { kind: "draw", side: "you", count: 1, ids: [] }], false)).toBeNull();
  });
});
