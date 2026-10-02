import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "./battleLog";
import { narrateEvents } from "./battleLog";
import { newOpponentReveals } from "./revealCues";

function entry(id: string, reveal?: BattleLogEntry["reveal"]): BattleLogEntry {
  return { id, turn: 2, text: "x", tone: "reveal", important: true, segments: [], ...(reveal ? { reveal } : {}) };
}
const R1 = { defId: "ST01-006", ownerSeat: 1 as const };
const MINE = { defId: "ST01-008", ownerSeat: 0 as const };

describe("newOpponentReveals", () => {
  it("never fires on the first look at a log (mount) (#256)", () => {
    expect(newOpponentReveals(undefined, [entry("a", R1)], 1)).toEqual([]);
  });

  it("returns only opponent reveals added after the last seen entry, in order (#256)", () => {
    const log = [entry("a", R1), entry("b"), entry("c", MINE), entry("d", { defId: "ST01-009", ownerSeat: 1 }), entry("e", R1)];
    expect(newOpponentReveals("b", log, 1).map((r) => r.entryId)).toEqual(["d", "e"]);
  });

  it("treats everything as new when the log was empty before (#256)", () => {
    expect(newOpponentReveals(null, [entry("a", R1)], 1)).toHaveLength(1);
  });

  it("ignores a replaced log (resync / undo drops the last seen id) (#256)", () => {
    expect(newOpponentReveals("gone", [entry("a", R1)], 1)).toEqual([]);
  });
});

describe("log reveal field", () => {
  const narrate = (events: unknown[]) => narrateEvents(events, { youSeat: 0, turnNumber: 2 });

  it("marks a plain reveal with its card and owner (#256)", () => {
    const [l] = narrate([{ type: "card_revealed", seat: 1, defId: "ST01-006" }]);
    expect(l!.reveal).toEqual({ defId: "ST01-006", ownerSeat: 1 });
  });

  it("keeps the reveal on the merged reveal-and-add search line (#256)", () => {
    const lines = narrate([
      { type: "card_revealed", seat: 1, defId: "ST01-006" },
      { type: "card_moved", seat: 1, defId: "ST01-006", from: "deck", to: "hand" },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.reveal).toEqual({ defId: "ST01-006", ownerSeat: 1 });
  });

  it("does not mark an ordinary draw-style move or a hidden reveal (#256)", () => {
    const lines = narrate([
      { type: "card_moved", seat: 1, defId: "ST01-006", from: "deck", to: "hand" },
      { type: "card_revealed", seat: 1, defId: "HIDDEN" },
    ]);
    expect(lines.every((l) => !l.reveal)).toBe(true);
  });
});
