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

  it("reads edit lines written with markdown, a real minus sign, card names and paired swaps, but not prose that merely mentions a card (#414)", () => {
    const f = extractFacts(
      [
        "1. **+2 OP01-016 Nami / -2 OP01-009 Carrot.** Nami costs 1.",
        "- **\u22124 Komachiyo (OP01-010):** vanilla 3000.",
        "* +4 OP13-097 The World's Equilibrium",
        "\u20132 Sai (OP01-012)",
        "**\u22122 Cavendish (OP01-008), \u22122 Carrot (OP01-009):** cut both.",
        "- 2 turns earlier than Nami (OP01-016) would",
        "- Swap Carrot (OP01-009) out, +2000 power on Nami (OP01-016)",
        "Play +1 turn earlier with OP01-001.",
      ].join("\n"),
    );
    expect(f.edits).toEqual([
      { sign: "+", copies: 2, id: "OP01-016" },
      { sign: "-", copies: 2, id: "OP01-009" },
      { sign: "-", copies: 4, id: "OP01-010" },
      { sign: "+", copies: 4, id: "OP13-097" },
      { sign: "-", copies: 2, id: "OP01-012" },
      { sign: "-", copies: 2, id: "OP01-008" },
      { sign: "-", copies: 2, id: "OP01-009" },
    ]);
  });
});
