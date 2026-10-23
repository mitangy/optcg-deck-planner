import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { generatePuzzles, quotas } from "./generate";
import { MESSAGE_LIMIT } from "./types";

const catalog = loadCatalog();

describe("the puzzle set", () => {
  it("is the same for the same seed and different for another (#677)", () => {
    const make = (seed: number) => generatePuzzles({ seed, n: 4, types: ["power", "playable", "scenario"], newShare: 0.5, synthShare: 0.5, catalog });
    const a = make(1);
    expect(make(1)).toEqual(a);
    const other = make(2);
    for (const type of ["power", "playable", "scenario"]) {
      expect(other.puzzles.filter((p) => p.type === type).map((p) => p.message), type).not.toEqual(a.puzzles.filter((p) => p.type === type).map((p) => p.message));
    }
    expect(a.puzzles.filter((p) => p.type === "power")).toHaveLength(4);
    expect(a.puzzles.map((p) => p.id)).toEqual(["power-s1-1", "power-s1-2", "power-s1-3", "power-s1-4", "playable-s1-1", "playable-s1-2", "playable-s1-3", "playable-s1-4", "scenario-s1-1", "scenario-s1-2", "scenario-s1-3", "scenario-s1-4"]);
    // Half the puzzles were asked to hold a card from OP18 or EB05, and every message fits the size bound.
    expect(a.puzzles.filter((p) => p.type !== "scenario" && p.newSet).length).toBeGreaterThanOrEqual(3);
    // Asked for all of them to hold a new-set card, every position puzzle does.
    const all = generatePuzzles({ seed: 3, n: 8, types: ["power", "playable"], newShare: 1, synthShare: 0.5, catalog });
    expect(all.puzzles.every((p) => p.newSet)).toBe(true);
    for (const p of a.puzzles) expect(p.message.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
  }, 120_000);

  it("splits the puzzles between Harness boards and self-play, and between new and older sets, by the shares (#677)", () => {
    expect(quotas(10, 0.5, 0.3)).toEqual({ "harness-new": 2, "harness-old": 3, "selfplay-new": 2, "selfplay-old": 3 });
    expect(quotas(25, 0.4, 0)).toEqual({ "harness-new": 0, "harness-old": 10, "selfplay-new": 0, "selfplay-old": 15 });
  });
});
