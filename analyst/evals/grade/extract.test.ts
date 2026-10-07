import { describe, expect, it } from "vitest";
import { extractFacts } from "./extract";

describe("fact extraction", () => {
  it("reads +N/-N edit lines with card numbers, and nothing else as an edit (#403)", () => {
    const f = extractFacts("Try:\n- 2 OP01-016\n+2x OP01-017\nOP01-001 stays. Play +1 turn earlier.");
    expect(f.edits).toEqual([
      { sign: "-", copies: 2, id: "OP01-016" },
      { sign: "+", copies: 2, id: "OP01-017" },
    ]);
  });

  it("reads percentages, game counts, win counts and number words (#403)", () => {
    const f = extractFacts("56.1% over 41 games, 23 wins; draw two cards.");
    expect(f.percents).toEqual([{ value: 56.1, whole: false }]);
    expect(f.games).toEqual([41]);
    expect(f.wins).toEqual([23]);
    expect(f.numbers).toContain(2);
  });
});
