import { describe, expect, it } from "vitest";
import type { BattleLogEntry, LogTone } from "../match/battleLog";
import { filterBattleLog } from "./battleLogFilter";

function entry(id: string, tone: LogTone, text = "x"): BattleLogEntry {
  return {
    id,
    turn: 1,
    text,
    tone,
    important: false,
    segments: [{ kind: "card", defId: "OP01-001", name: "Card", ownerSeat: 0 }],
  };
}

const LOG = [
  entry("a", "play"),
  entry("b", "attack"),
  entry("c", "counter"),
  entry("d", "ko"),
  entry("e", "effect", "Card activates its effect"),
  entry("f", "effect", "Card returns to hand"),
  entry("g", "trigger"),
];

describe("Battle log filter (#1243)", () => {
  it("Plays keeps only played, countered, triggered and activated lines, in order (#1243)", () => {
    expect(filterBattleLog(LOG, "plays").map((e) => e.id)).toEqual(["a", "c", "e", "g"]);
  });

  it("All keeps every line (#1243)", () => {
    expect(filterBattleLog(LOG, "all").map((e) => e.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});
