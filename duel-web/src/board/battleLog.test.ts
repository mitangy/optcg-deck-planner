import { describe, expect, it } from "vitest";
import { groupBattleLogByTurn, narrateEvents } from "./battleLog";

describe("narrateEvents", () => {
  it("describes attack, block, counter, and plays from your seat", () => {
    const lines = narrateEvents(
      [
        { type: "card_played", seat: 0, defId: "ST01-003" },
        {
          type: "don_given",
          seat: 0,
          targetDefId: "ST01-001",
          newPower: 7000,
        },
        {
          type: "attack_declared",
          seat: 0,
          target: { kind: "leader" },
          attackerPower: 7000,
          defenderPower: 5000,
        },
        { type: "blocked", seat: 1 },
        { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 3000 },
        {
          type: "battle_resolved",
          attackerWon: false,
          attackerPower: 7000,
          defenderPower: 8000,
        },
      ],
      { youSeat: 0, turnNumber: 2 },
    ).map((e) => e.text);

    expect(lines.some((t) => t.includes("play"))).toBe(true);
    expect(lines.some((t) => t.includes("attach") && t.includes("7000"))).toBe(
      true,
    );
    expect(lines.some((t) => t.includes("attack Leader") && t.includes("7000 vs 5000"))).toBe(
      true,
    );
    expect(lines).toContain("Opponent blocks");
    expect(lines.some((t) => t.includes("counter"))).toBe(true);
    expect(lines.some((t) => t.includes("Battle fails") && t.includes("7000 vs 8000"))).toBe(
      true,
    );
  });

  it("describes pending-choice ability prompts (on_play / life_trigger chain-ready queue)", () => {
    const lines = narrateEvents(
      [
        {
          type: "pending_choice_added",
          seat: 0,
          kind: "on_play",
          cardDefId: "ST01-005",
          sourceInstanceId: "c1",
          optional: true,
          prompt: "Usopp — On Play: draw 1 card?",
        },
        {
          type: "pending_choice_resolved",
          seat: 0,
          kind: "on_play",
          cardDefId: "ST01-005",
          accepted: true,
        },
        {
          type: "pending_choice_resolved",
          seat: 1,
          kind: "life_trigger",
          cardDefId: "ST01-003",
          accepted: false,
        },
      ],
      { youSeat: 0, turnNumber: 3 },
    ).map((e) => e.text);

    expect(lines[0]).toMatch(/You may resolve Usopp's on play/i);
    expect(lines[1]).toMatch(/You accept Usopp's on play/i);
    expect(lines[2]).toMatch(/Opponent declines Karoo's life trigger/i);
  });

  it("groups by turn", () => {
    const entries = [
      ...narrateEvents([{ type: "drew", seat: 0, count: 1 }], {
        youSeat: 0,
        turnNumber: 1,
      }),
      ...narrateEvents([{ type: "don_placed", seat: 0, count: 2 }], {
        youSeat: 0,
        turnNumber: 2,
      }),
    ];
    const groups = groupBattleLogByTurn(entries);
    expect(groups.map((g) => g.turn)).toEqual([1, 2]);
  });
});
