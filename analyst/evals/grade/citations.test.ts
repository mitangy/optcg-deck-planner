import { describe, expect, it } from "vitest";
import { citationCheck, sourceMatches } from "./citations";

const cite = (...sources: string[]) => sources.map((source) => ({ source }));

describe("citations", () => {
  it("needs a citation for every required group, not just one (#403)", () => {
    const cites = { all: [["card:OP01-061"], ["odds:d50h8x1s"]] };
    expect(citationCheck(cite("card:OP01-061"), cites)).toMatchObject({ ok: false, missing: [["odds:d50h8x1s"]] });
    expect(citationCheck(cite("card:OP01-061", "odds:d50h8x1s"), cites).ok).toBe(true);
  });

  it("accepts any alternative within a group, and a * suffix wildcard (#403)", () => {
    expect(citationCheck(cite("rule:10-1-4"), { all: [["ruling:general#99d5d707", "rule:10-1-4"]] }).ok).toBe(true);
    expect(citationCheck(cite("card:OP15-058"), { all: [["card:*"]] }).ok).toBe(true);
    expect(citationCheck(cite("note:card:OP15-058"), { all: [["card:*"]] }).ok).toBe(false);
  });

  it("does not let ruling:OP01-061#12 satisfy ruling:OP01-061#1 (#403)", () => {
    expect(sourceMatches("ruling:OP01-061#1", "ruling:OP01-061#12")).toBe(false);
    expect(citationCheck(cite("ruling:OP01-061#12"), { all: [["ruling:OP01-061#1"]] }).ok).toBe(false);
  });

  it("fails an answer that cites a forbidden ruling (#403)", () => {
    const cites = { all: [["card:OP01-013"]], none: ["ruling:OP01-013#<n>"] };
    expect(citationCheck(cite("card:OP01-013", "ruling:OP01-013#2"), cites)).toMatchObject({ ok: false, forbidden: ["ruling:OP01-013#2"] });
    // The ban status block is not a numbered ruling.
    expect(citationCheck(cite("card:OP01-013", "ruling:OP01-013#ban"), cites).ok).toBe(true);
  });

  it("counts a rule's subsections as citing the rule, but not a longer section number (#414)", () => {
    expect(sourceMatches("rule:10-1-4", "rule:10-1-4-1")).toBe(true);
    expect(sourceMatches("rule:10-1-4", "rule:10-1-4-1-2")).toBe(true);
    expect(sourceMatches("rule:10-1-4", "rule:10-1-40")).toBe(false);
    expect(sourceMatches("ruling:OP01-061#1", "ruling:OP01-061#1-2")).toBe(false);
  });
});
