import { describe, expect, it } from "vitest";
import { replayStatus, type ReplayStatusInput } from "./replayStatus";

const base: ReplayStatusInput = {
  replay: { schema: 1, rulesVersion: "0.3.0", registryHash: "aaaa", end: { winner: 1, reason: "leader_battle_at_zero_life" } },
  current: { rulesVersion: "0.3.0", registryHash: "aaaa" },
  startFailed: false,
  timeline: { steps: 144, winner: 1, turnNumber: 14 },
  recordedTurns: 14,
};

describe("can a recording be watched", () => {
  it("a recording that replays to the same result on the same rules is exact (#476)", () => {
    expect(replayStatus(base)).toEqual({ kind: "exact" });
  });

  it("a recording from an older registry still plays, flagged as drift (#476)", () => {
    expect(replayStatus({ ...base, replay: { ...base.replay, registryHash: "old" } })).toEqual({ kind: "drift", reason: "version" });
    expect(replayStatus({ ...base, replay: { ...base.replay, rulesVersion: "0.2.0" } })).toEqual({ kind: "drift", reason: "version" });
  });

  it("a different final winner is flagged even when versions match (#476)", () => {
    expect(replayStatus({ ...base, timeline: { steps: 144, winner: 0, turnNumber: 14 } })).toEqual({ kind: "drift", reason: "outcome" });
  });

  it("a different turn count is flagged even when versions match (#476)", () => {
    expect(replayStatus({ ...base, timeline: { steps: 144, winner: 1, turnNumber: 15 } })).toEqual({ kind: "drift", reason: "outcome" });
  });

  it("a game that ended outside the engine (concede) is not flagged for having no engine winner (#476)", () => {
    const conceded = { ...base, replay: { ...base.replay, end: { winner: 1 as const, reason: "concede" } }, timeline: { steps: 144, winner: null, turnNumber: 14 } };
    expect(replayStatus(conceded)).toEqual({ kind: "exact" });
  });

  it("divergence at the first intent is unavailable with the log link (#476)", () => {
    const status = replayStatus({ ...base, timeline: { steps: 0, diverged: { atIntent: 0 }, winner: null, turnNumber: 1 } });
    expect(status).toEqual({ kind: "unavailable", reason: "first-move" });
  });

  it("divergence part way plays up to there and says so (#476)", () => {
    const status = replayStatus({ ...base, timeline: { steps: 40, diverged: { atIntent: 40 }, winner: null, turnNumber: 5 } });
    expect(status).toEqual({ kind: "partial", steps: 40, atIntent: 40 });
  });

  it("a recording that cannot be dealt, or from another schema, is unavailable (#476)", () => {
    expect(replayStatus({ ...base, startFailed: true })).toEqual({ kind: "unavailable", reason: "start" });
    expect(replayStatus({ ...base, replay: { ...base.replay, schema: 2 } })).toEqual({ kind: "unavailable", reason: "schema" });
  });
});
