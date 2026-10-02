import { describe, expect, it } from "vitest";
import type { BattleLogEntry, LogTone } from "./battleLog";
import { recentPlays } from "./recentPlays";

function entry(id: string, tone: LogTone, ownerSeat: 0 | 1, defId: string, turn: number, text = "x"): BattleLogEntry {
  return {
    id,
    turn,
    text,
    tone,
    important: false,
    segments: [{ kind: "card", defId, name: defId, ownerSeat }],
  };
}

describe("recentPlays", () => {
  it("lists newest first across both seats and marks whose it is", () => {
    const got = recentPlays(
      [entry("a", "play", 0, "A", 1), entry("b", "counter", 1, "B", 2), entry("c", "trigger", 0, "C", 3)],
      0,
    );
    expect(got.map((p) => [p.defId, p.mine])).toEqual([
      ["C", true],
      ["B", false],
      ["A", true],
    ]);
  });

  it("keeps only the newest `limit` plays", () => {
    const entries = ["a", "b", "c", "d"].map((d, i) => entry(d, "play", 0, d.toUpperCase(), i + 1));
    expect(recentPlays(entries, 0, 2).map((p) => p.defId)).toEqual(["D", "C"]);
  });

  it("does not count skipped lines against the limit", () => {
    const got = recentPlays(
      [entry("a", "play", 0, "A", 1), entry("b", "attack", 0, "B", 2), entry("c", "ko", 1, "C", 2)],
      0,
      2,
    );
    expect(got.map((p) => p.defId)).toEqual(["A"]);
  });

  it("only counts 'activates its effect' effect lines", () => {
    const got = recentPlays(
      [
        entry("a", "effect", 1, "ACT", 1, "Opp's ACT activates its effect"),
        entry("b", "effect", 1, "BOUNCE", 1, "Opp's BOUNCE is returned to hand"),
      ],
      0,
    );
    expect(got.map((p) => p.defId)).toEqual(["ACT"]);
  });

  it("labels who did what and when, without relying on colour", () => {
    const [mine, theirs] = recentPlays(
      [entry("a", "play", 1, "OPP", 5), entry("b", "counter", 0, "ME", 6)],
      0,
      6,
      (d) => `Name ${d}`,
    );
    expect(mine!.label).toBe("You countered Name ME, turn 6");
    expect(theirs!.label).toBe("Opponent played Name OPP, turn 5");
  });

  it("flips ownership with the viewer's seat", () => {
    const e = [entry("a", "play", 1, "X", 1)];
    expect(recentPlays(e, 1)[0]!.mine).toBe(true);
    expect(recentPlays(e, 0)[0]!.mine).toBe(false);
  });

  it("labels each row with who used the card, what they did and the turn (#247)", () => {
    const got = recentPlays(
      [entry("a", "counter", 1, "A", 4), entry("b", "play", 0, "B", 5)],
      0,
    );
    expect(got.map((p) => [p.who, p.detail])).toEqual([
      ["You", "played \u00b7 Turn 5"],
      ["Opponent", "countered \u00b7 Turn 4"],
    ]);
  });
});
