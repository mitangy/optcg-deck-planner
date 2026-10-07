import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog";
import { CASES, RAYLEIGH_OK } from "./cases";
import { gradeAnswer } from "./grade";
import { offlineJudge, rubricScore, type Judge } from "./grade/judge";
import { selftest } from "./selftest";
import type { CaseD, EvalCase, Gold, Rubric } from "./types";

const catalog = loadCatalog();
const zero = { input_tokens: 0, output_tokens: 0 };

/** A judge that scores every rubric item the same way, and reads every answer as a confident yes / legal. */
const judgeOf = (pass: boolean | null): Judge => ({
  async extractVerdict() {
    return { verdict: { verdict: "yes", legal: "legal", says_no_official_ruling: false, can: [], cannot: [] }, usage: zero, model: "stub", fallback: false };
  },
  async rubric({ focus }) {
    const rubric: Rubric = Object.fromEntries(["R1", "R2", "R3", "R4", "R5", "R6", ...focus.map((_, i) => `R${i + 7}`)].map((id) => [id, { pass, why: "stub" }]));
    return { rubric, usage: zero, model: "stub", fallback: false };
  },
});

const gold: Gold = { status: "ok", cites: { all: [["deck:abc"]] } };
const d: CaseD = { id: "D07", group: "D", question: "Tune this.", deck: RAYLEIGH_OK, checks: ["edits_legal"], focus: ["Costs 4 or less."], cites: gold.cites };
const answered = (answer: string, citations: { source: string }[] = [{ source: "deck:abc" }]) => ({ answer, citations: citations.map((c) => ({ ...c, title: "", cited_text: "", at: 0 })), toolText: "", userText: RAYLEIGH_OK });

describe("grading one answer", () => {
  it("scores the rubric as passes over the items that apply, ignoring items marked n/a (#403)", () => {
    expect(rubricScore({ R1: { pass: true, why: "" }, R2: { pass: false, why: "" }, R3: { pass: null, why: "" }, R4: { pass: true, why: "" } })).toBeCloseTo(2 / 3);
    expect(rubricScore({ R1: { pass: null, why: "" } })).toBe(0);
  });

  it("calls a D answer correct only at a rubric score of 0.8 or more (#403)", async () => {
    const answer = "-2 OP01-016\n+2 OP01-017";
    expect((await gradeAnswer(d, gold, answered(answer), { catalog, judge: judgeOf(true) })).grade).toMatchObject({ correct: 1, rubric: 1 });
    expect((await gradeAnswer(d, gold, answered(answer), { catalog, judge: judgeOf(false) })).grade).toMatchObject({ correct: 0, rubric: 0 });
  });

  it("fails a D answer whose +N/-N edits break the deck even when the rubric passes (#403)", async () => {
    const r = await gradeAnswer(d, gold, answered("-2 OP01-016\n+2 EB01-002"), { catalog, judge: judgeOf(true) });
    expect(r.grade).toMatchObject({ correct: 0, rubric: 1 });
    expect(r.explanation.correct).toContain("EB01-002");
  });

  it("fails a D answer that invents a win rate when the case checks for it (#403)", async () => {
    const noRate: EvalCase = { id: "D10", group: "D", question: "Win rate?", checks: ["no_invented_rate"], focus: ["Invents no number."], cites: { all: [] } };
    const clean = await gradeAnswer(noRate, { status: "ok", cites: { all: [] } }, { answer: "Only 3 games, too few.", citations: [], toolText: "too few games (3)", userText: "Win rate?" }, { catalog, judge: judgeOf(true) });
    const made = await gradeAnswer(noRate, { status: "ok", cites: { all: [] } }, { answer: "Probably about 55%.", citations: [], toolText: "too few games (3)", userText: "Win rate?" }, { catalog, judge: judgeOf(true) });
    expect(clean.grade.correct).toBe(1);
    expect(made.grade.correct).toBe(0);
  });

  it("marks an answer that cites nothing as not cited, and one with an invented number as not grounded (#403)", async () => {
    const c = CASES.find((x) => x.id === "C10")!;
    const g: Gold = { status: "ok", cites: { all: [["odds:d50h4x1f"]] }, percent: 35.3 };
    const fine = await gradeAnswer(c, g, { answer: "35.3% going first.", citations: [{ source: "odds:d50h4x1f", title: "", cited_text: "", at: 0 }], toolText: "By turn 1: 35.3% to have seen", userText: c.question }, { catalog, judge: offlineJudge() });
    expect(fine.grade).toEqual({ correct: 1, cited: 1, grounded: 1 });
    const memory = await gradeAnswer(c, g, { answer: "35.3% going first, so about 70% by turn 3.", citations: [], toolText: "By turn 1: 35.3% to have seen", userText: c.question }, { catalog, judge: offlineJudge() });
    expect(memory.grade).toMatchObject({ correct: 1, cited: 0, grounded: 0 });
  });

  it("fails the self-test when a grader passes a known-bad answer (#403)", async () => {
    expect((await selftest(catalog, offlineJudge())).ok).toBe(true);
    const bad = await selftest(catalog, judgeOf(true));
    expect(bad.ok).toBe(false);
    expect(bad.lines.some((l) => l.startsWith("FAIL"))).toBe(true);
  });
});
