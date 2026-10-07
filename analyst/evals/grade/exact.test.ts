import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import type { Gold, Verdict } from "../types";
import { gradeC, gradeVerdict } from "./exact";

const catalog = loadCatalog();
const cites = { all: [] };
const v = (over: Partial<Verdict> = {}): Verdict => ({ verdict: "unclear", legal: "unclear", says_no_official_ruling: false, can: [], cannot: [], ...over });

describe("exact grading", () => {
  it("passes 91.2% and fails 89.2% for C12's gold (#403)", () => {
    const gold: Gold = { status: "ok", cites, percent: 91.2 };
    expect(gradeC(gold, "About 91.2% by turn 3.", v(), catalog).correct).toBe(1);
    expect(gradeC(gold, "About 89.2% by turn 3.", v(), catalog).correct).toBe(0);
  });

  it("passes a whole 78% when the gold is 78.0 but fails 35% for 35.3 (#403)", () => {
    expect(gradeC({ status: "ok", cites, percent: 78 }, "78% by turn 3.", v(), catalog).correct).toBe(1);
    expect(gradeC({ status: "ok", cites, percent: 78 }, "79% by turn 3.", v(), catalog).correct).toBe(0);
    expect(gradeC({ status: "ok", cites, percent: 35.3 }, "35% in the opening hand.", v(), catalog).correct).toBe(0);
  });

  it(`fails "legal" against a not-legal gold, and a not-legal answer that names no offending card (#403)`, () => {
    const gold: Gold = { status: "ok", cites, legal: false, offending: ["OP01-004"] };
    expect(gradeC(gold, "Yes, it is legal.", v({ legal: "legal" }), catalog).correct).toBe(0);
    expect(gradeC(gold, "No, this deck is not legal.", v({ legal: "not_legal" }), catalog).correct).toBe(0);
    expect(gradeC(gold, "Not legal: OP01-004 has 5 copies.", v({ legal: "not_legal" }), catalog).correct).toBe(1);
    expect(gradeC(gold, "Not legal: Usopp has 5 copies.", v({ legal: "not_legal" }), catalog).correct).toBe(1);
    // Calling it legal fails even when the answer happens to mention the offending card.
    expect(gradeC(gold, "Yes, legal, though OP01-004 is close to the limit.", v({ legal: "legal" }), catalog).correct).toBe(0);
  });

  it("scores an unclear verdict as wrong (#403)", () => {
    const gold: Gold = { status: "ok", cites, verdict: "yes" };
    expect(gradeVerdict(gold, "It depends.", v({ verdict: "unclear" }), catalog).correct).toBe(0);
    expect(gradeVerdict(gold, "Yes.", v({ verdict: "yes" }), catalog).correct).toBe(1);
    expect(gradeVerdict(gold, "No.", v({ verdict: "no" }), catalog).correct).toBe(0);
  });

  it("needs the errata date in the answer, in any common written form (#403)", () => {
    const gold: Gold = { status: "ok", cites, verdict: "yes", dates: ["December 8, 2023", "2023-12-08"] };
    expect(gradeVerdict(gold, "Yes, errata'd on 2023-12-08.", v({ verdict: "yes" }), catalog).correct).toBe(1);
    expect(gradeVerdict(gold, "Yes, it was errata'd.", v({ verdict: "yes" }), catalog).correct).toBe(0);
  });

  it("needs the gold number among the answer's numbers, ignoring the digits in card numbers (#403)", () => {
    const gold: Gold = { status: "ok", cites, number: 1 };
    expect(gradeVerdict(gold, "Kaido adds 1 DON!!.", v(), catalog).correct).toBe(1);
    expect(gradeVerdict(gold, "OP01-061 adds nothing.", v(), catalog).correct).toBe(0);
  });

  it("needs which cards can and cannot, and rejects one listed as both (#403)", () => {
    const gold: Gold = { status: "ok", cites, can: ["ST01-006"], cannot: ["OP04-104"] };
    const right = v({ can: ["Tony Tony.Chopper"], cannot: ["OP04-104 Sanji"] });
    expect(gradeVerdict(gold, "Only Chopper can block.", right, catalog).correct).toBe(1);
    // Sanji listed as unable but Chopper never listed as able.
    expect(gradeVerdict(gold, "Only Chopper.", v({ cannot: ["OP04-104 Sanji"] }), catalog).correct).toBe(0);
    expect(gradeVerdict(gold, "Both can block.", v({ can: ["Tony Tony.Chopper", "Sanji"] }), catalog).correct).toBe(0);
    expect(gradeVerdict(gold, "Both, but Sanji can't.", v({ can: ["Tony Tony.Chopper", "Sanji"], cannot: ["Sanji"] }), catalog).correct).toBe(0);
    expect(gradeVerdict(gold, "Only Sanji.", v({ can: ["Sanji"], cannot: ["Tony Tony.Chopper"] }), catalog).correct).toBe(0);
  });

  it("needs an A15 answer to say no official ruling covers it (#403)", () => {
    const gold: Gold = { status: "ok", cites, verdict: "no_ruling" };
    expect(gradeVerdict(gold, "No.", v({ verdict: "no" }), catalog).correct).toBe(0);
    expect(gradeVerdict(gold, "No ruling covers it; no.", v({ verdict: "no", says_no_official_ruling: true }), catalog).correct).toBe(1);
  });
});
