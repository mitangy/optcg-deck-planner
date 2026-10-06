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

  it("switches the rng at a recorded reseed so an undone game replays (#369)", () => {
    const first = replayMatch(base).activeSeat;
    const intents: MatchReplay["intents"] = [
      { seat: first, intent: { type: "end_turn" } },
      { seat: (1 - first) as 0 | 1, intent: { type: "end_turn" } },
    ];
    const plain = replayMatch({ ...base, intents });
    const reseeded = replayMatch({ ...base, intents, reseeds: [{ atIntent: 1, seed: 123456 }] });
    expect(plain.rng.seed).toBe(base.seed);
    expect(reseeded.rng.seed).toBe(123456);
    // An undo with no move after it leaves the live state on the new seed too.
    expect(replayMatch({ ...base, intents, reseeds: [{ atIntent: 2, seed: 123456 }] }).rng.seed).toBe(123456);
  });

  it("reshuffles both decks at a reseed marked shuffleDecks, leaving Life alone (#369)", () => {
    const plain = replayMatch(base);
    const shuffled = replayMatch({ ...base, reseeds: [{ atIntent: 0, seed: 99, shuffleDecks: true }] });
    for (const seat of [0, 1] as const) {
      const a = plain.players[seat];
      const b = shuffled.players[seat];
      expect([...b.zoneInstanceIds.deck].sort()).toEqual([...a.zoneInstanceIds.deck].sort());
      expect(b.zoneInstanceIds.deck).not.toEqual(a.zoneInstanceIds.deck);
      // defIds stay paired with their instance ids.
      const defOf = (p: typeof a, id: string) => p.deck[p.zoneInstanceIds.deck.indexOf(id)];
      for (const id of a.zoneInstanceIds.deck) expect(defOf(b, id)).toBe(defOf(a, id));
      expect(b.life).toEqual(a.life);
      expect(b.zoneInstanceIds.life).toEqual(a.zoneInstanceIds.life);
    }
    // Without the flag only the rng moves.
    const unflagged = replayMatch({ ...base, reseeds: [{ atIntent: 0, seed: 99 }] });
    expect(unflagged.players[0].zoneInstanceIds.deck).toEqual(plain.players[0].zoneInstanceIds.deck);
  });

  it("narrates cards a seat can't see as hidden instead of failing (#244)", () => {
    let lines: string[] = [];
    expect(() => {
      lines = describeEvents([{ type: "life_taken", seat: 1, defId: "HIDDEN", toHand: true }]);
    }).not.toThrow();
    expect(lines).toEqual(["Seat 1 takes Life"]);
  });
});
