import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { describeEvents } from "../describeEvents.js";
import { listLegalIntents } from "../engine.js";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../matchReplay.js";

const base: MatchReplay = {
  schema: MATCH_REPLAY_SCHEMA,
  rulesVersion: "test",
  registryHash: "test",
  seed: 9,
  firstSeat: 0,
  skipMulligans: true,
  players: [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ],
  intents: [],
};

describe("match replays", () => {
  it("stops with the intent's index when a recorded move is no longer legal (#244)", () => {
    const start = replayMatch(base);
    const waiting = (1 - start.activeSeat) as 0 | 1;
    expect(listLegalIntents(start, waiting).some((i) => i.type === "end_turn")).toBe(false);
    const bad: MatchReplay = {
      ...base,
      intents: [
        { seat: start.activeSeat, intent: { type: "end_turn" } },
        { seat: start.activeSeat, intent: { type: "end_turn" } },
      ],
    };
    expect(() => replayMatch(bad)).toThrow(/Replay diverged at intent 1 \(end_turn\)/);
  });

  it("narrates cards a seat can't see as hidden instead of failing (#244)", () => {
    let lines: string[] = [];
    expect(() => {
      lines = describeEvents([{ type: "life_taken", seat: 1, defId: "HIDDEN", toHand: true }]);
    }).not.toThrow();
    expect(lines).toEqual(["Seat 1 takes Life"]);
  });
});
