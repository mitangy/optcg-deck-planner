import { describe, expect, it } from "vitest";
import { lookupCard } from "../cards/atlas";
import type { SeatLogJson } from "./historyApi";
import { groupHand, matchLogTurns } from "./matchLog";

const zoro = "OP01-001";
const log: SeatLogJson = {
  schema: 1,
  seat: 1,
  openingHand: [],
  boardCards: [["c7", zoro, 0], ["L1", "OP05-060", 1]],
  turns: [
    { turn: 0, activeSeat: 0, events: [{ type: "mulligan_resolved", seat: 1, didMulligan: false }] },
    { turn: 1, activeSeat: 0, events: [{ type: "phase_changed", phase: "refresh", activeSeat: 0 }, { type: "don_placed", seat: 0, count: 1 }] },
    {
      turn: 2,
      activeSeat: 1,
      events: [{ type: "drew", seat: 1, count: 1 }],
    },
    {
      turn: 3,
      activeSeat: 0,
      events: [{ type: "attack_declared", seat: 0, attackerId: "c7", target: { kind: "leader", instanceId: "L1" }, attackerPower: 6000, defenderPower: 5000 }],
    },
  ],
};

describe("match page log", () => {
  it("labels each turn from your seat (#252)", () => {
    expect(matchLogTurns(log).map((t) => [t.turn, t.label])).toEqual([
      [0, "Before the game"],
      [1, "Opponent's turn"],
      [2, "Your turn"],
      [3, "Opponent's turn"],
    ]);
  });

  it("names the attacking card from the cards that were on the board (#252)", () => {
    const attack = matchLogTurns(log).find((t) => t.turn === 3)!.entries[0]!;
    expect(attack.text).toBe(`Opponent's ${lookupCard(zoro).name} attacks your Leader (6000 vs 5000)`);
  });

  it("passes each turn's hand and the opponent's hand size through (#350)", () => {
    const withHands: SeatLogJson = {
      ...log,
      turns: [
        { ...log.turns[2]!, hand: ["OP01-001", "OP05-060"], opponentHandCount: 5 },
        { ...log.turns[3]!, hand: [], opponentHandCount: 0 },
        log.turns[1]!,
      ],
    };
    const turns = matchLogTurns(withHands);
    expect(turns.map((t) => [t.turn, t.hand, t.opponentHandCount])).toEqual([
      [2, ["OP01-001", "OP05-060"], 5],
      [3, [], 0],
      [1, undefined, undefined],
    ]);
  });

  it("passes the opponent's revealed hand through when the log has it (#359)", () => {
    const revealed: SeatLogJson = {
      ...log,
      turns: [{ ...log.turns[2]!, hand: ["OP01-001"], opponentHandCount: 2, opponentHand: ["OP05-060", "OP01-016"] }, log.turns[1]!],
    };
    expect(matchLogTurns(revealed).map((t) => t.opponentHand)).toEqual([["OP05-060", "OP01-016"], undefined]);
  });

  it("pairs turns into rounds by turn number, even when a turn is skipped (#470)", () => {
    // Turn 2 has only phase steps, so it has no entries and is left out of the list.
    const skipped: SeatLogJson = {
      ...log,
      turns: [
        log.turns[1]!,
        { turn: 2, activeSeat: 1, events: [{ type: "phase_changed", phase: "main", activeSeat: 1 }] },
        log.turns[3]!,
        { turn: 4, activeSeat: 1, events: [{ type: "drew", seat: 1, count: 1 }] },
        { turn: 5, activeSeat: 0, events: [{ type: "don_placed", seat: 0, count: 1 }] },
      ],
    };
    expect(matchLogTurns(skipped).map((t) => [t.turn, t.round, t.col])).toEqual([
      [1, 1, 1],
      [3, 2, 1],
      [4, 2, 2],
      [5, 3, 1],
    ]);
  });

  it("merges copies of a card in a hand and keeps first-seen order (#470)", () => {
    expect(groupHand(["OP05-060", "OP01-001", "OP05-060", "ST01-003", "OP01-001", "OP05-060"])).toEqual([
      { defId: "OP05-060", count: 3 },
      { defId: "OP01-001", count: 2 },
      { defId: "ST01-003", count: 1 },
    ]);
  });
});
