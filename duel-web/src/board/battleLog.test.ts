import { describe, expect, it } from "vitest";
import { groupBattleLogByTurn, narrateEvents } from "./battleLog";

describe("narrateEvents", () => {
  it("describes attack, block, counter, and plays from your seat", () => {
    const lines = narrateEvents(
      [
        { type: "card_played", seat: 0, defId: "ST01-003" },
        { type: "don_given", seat: 0 },
        {
          type: "attack_declared",
          seat: 0,
          target: { kind: "leader" },
        },
        { type: "blocked", seat: 1 },
        { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 3000 },
        { type: "battle_resolved", attackerWon: false },
      ],
      { youSeat: 0, turnNumber: 2 },
    ).map((e) => e.text);

    expect(lines.some((t) => t.includes("play"))).toBe(true);
    expect(lines).toContain("You attach DON!!");
    expect(lines).toContain("You attack Leader");
    expect(lines).toContain("Opponent blocks");
    expect(lines.some((t) => t.includes("counter"))).toBe(true);
    expect(lines).toContain("Battle fails");
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
