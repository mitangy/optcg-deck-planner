import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendHumanGrades, cohenKappa, exportForGrading, judgeAgreement, RESULT_CAP, toHumanGrades, type HumanGrade } from "./human-grades";
import type { Rubric } from "./types";

const OFFICIAL = "when this character attacks you may trash one card from your hand to give up to one of your opponents characters minus three thousand power during this turn";

/** A one-case run folder: D01 rep 0 with one tool call. */
function run(answer: string, toolResult: string, rubric?: Rubric) {
  const dir = mkdtempSync(join(tmpdir(), "hg-"));
  mkdirSync(join(dir, "traces"));
  const turn = [
    { role: "user", content: "q" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "playbook", input: { leader: "OP13-004" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: toolResult }] },
    { role: "assistant", content: [{ type: "text", text: answer }] },
  ];
  writeFileSync(join(dir, "traces", "D01_rep0.json"), JSON.stringify({ case: "D01", rep: 0, turn, rubric }));
  writeFileSync(join(dir, "results.jsonl"), `${JSON.stringify({ case: "D01", rep: 0, answer_sha256: "abc123" })}\n`);
  return dir;
}
const ctx = (dir: string) => ({ dir, run: "r1", gitSha: "sha", now: "2026-01-01T00:00:00Z" });
const allItems = (dir: string, v: "y" | "n" | "na") => Object.fromEntries(Object.keys(exportForGrading(dir)[0]!.items).map((id) => [id, v]));

const row = (over: Partial<HumanGrade>): HumanGrade => ({ case: "D01", rep: 0, run: "r1", git_sha: "", answer_sha256: "", items: {}, overall: 3, note: "", grader: "miko", graded_at: "", ...over });
const judge = (pass: (boolean | null)[]): Rubric => ({ R1: { pass: pass[0] ?? null, why: "w" } });

describe("human grading (#1038)", () => {
  it("kappa is 0 for a judge that always passes even though raw agreement is 80% (#1038)", () => {
    const rows = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0].map((h, i) => row({ rep: i, items: { R1: h as 0 | 1 } }));
    const byKey = Object.fromEntries(rows.map((r) => [`D01_rep${r.rep}`, judge([true])]));
    const a = judgeAgreement(rows, byKey).items[0]!;
    expect(a.percent).toBe(80);
    expect(a.kappa).toBeCloseTo(0, 5);
    expect(cohenKappa([[1, 1], [1, 1]])).toBe(1);
  });

  it("leaves n/a items out of the agreement count and counts them as skipped (#1038)", () => {
    const rows = [row({ rep: 0, items: { R1: 1 } }), row({ rep: 1, items: { R1: null } }), row({ rep: 2, items: { R1: 0 } })];
    const byKey: Record<string, Rubric> = { D01_rep0: judge([true]), D01_rep1: judge([true]), D01_rep2: judge([null]) };
    const { items, disagreements } = judgeAgreement(rows, byKey);
    expect(items[0]).toMatchObject({ n: 1, agree: 1, skipped: 2 });
    expect(disagreements).toEqual([]);
  });

  it("lists a disagreement with the judge's reason and the note (#1038)", () => {
    const { disagreements } = judgeAgreement([row({ items: { R1: 0 }, note: "wrong card" })], { D01_rep0: { R1: { pass: true, why: "looked fine" } } });
    expect(disagreements).toEqual([{ key: "D01_rep0", item: "R1", human: 0, judge: 1, judgeWhy: "looked fine", note: "wrong card" }]);
  });

  it("re-grading a run, case and rep replaces the old line instead of duplicating it (#1038)", () => {
    const file = join(mkdtempSync(join(tmpdir(), "hg-")), "g.jsonl");
    appendHumanGrades(file, [row({ overall: 2 }), row({ rep: 1, overall: 4 })]);
    appendHumanGrades(file, [row({ overall: 5 }), row({ run: "r2", overall: 1 })]);
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as HumanGrade);
    expect(lines.map((l) => `${l.run}/${l.rep}/${l.overall}`).sort()).toEqual(["r1/0/5", "r1/1/4", "r2/0/1"]);
  });

  it("export carries the question, answer and tool results but never the judge's rubric (#1038)", () => {
    const dir = run("Go first.", "stats text", { R1: { pass: true, why: "SECRET-JUDGE-WHY" } });
    const [x] = exportForGrading(dir);
    expect(x).toMatchObject({ key: "D01_rep0", answer: "Go first.", tools: [{ name: "playbook", input: '{"leader":"OP13-004"}', result: "stats text" }] });
    expect(JSON.stringify(x)).not.toContain("SECRET-JUDGE-WHY");
  });

  it("cuts a long tool result (#1038)", () => {
    const [x] = exportForGrading(run("a", "z".repeat(RESULT_CAP + 500)));
    expect(x!.tools[0]!.result).toBe(`${"z".repeat(RESULT_CAP)}… (cut)`);
  });

  it("converts y/n/na to 1/0/null and takes the hash from results.jsonl (#1038)", () => {
    const dir = run("Go first.", "t");
    const items = { ...allItems(dir, "y"), R2: "n" as const, R3: "na" as const };
    const { rows, skipped } = toHumanGrades([{ key: "D01_rep0", items, overall: 4, note: "ok" }], ctx(dir));
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({ case: "D01", rep: 0, answer_sha256: "abc123", overall: 4, grader: "miko", answer: "Go first." });
    expect(rows[0]!.items).toMatchObject({ R1: 1, R2: 0, R3: null });
  });

  it("drops answer text that repeats 12 words of official text but keeps the hash (#1038)", () => {
    const dir = run(`Per the rules, ${OFFICIAL}, so plan around it.`, OFFICIAL);
    const { rows } = toHumanGrades([{ key: "D01_rep0", items: allItems(dir, "y"), overall: 3, note: "" }], ctx(dir));
    expect(rows[0]!.answer).toBeUndefined();
    expect(rows[0]!.answer_sha256).toBe("abc123");
  });

  it("skips a grade with an unanswered item or an overall outside 1-5 and reports it (#1038)", () => {
    const dir = run("a", "t");
    const items = allItems(dir, "y");
    delete items.R4;
    const { rows, skipped } = toHumanGrades(
      [{ key: "D01_rep0", items, overall: 3, note: "" }, { key: "D01_rep0", items: allItems(dir, "y"), overall: 0, note: "" }],
      ctx(dir),
    );
    expect(rows).toEqual([]);
    expect(skipped.map((s) => s.why)).toEqual(["item R4 not answered", "overall out of range"]);
  });

  it("keeps a grade with no overall, storing overall null (#1042)", () => {
    const dir = run("a", "t");
    const { rows, skipped } = toHumanGrades(
      [{ key: "D01_rep0", items: allItems(dir, "y"), note: "" }, { key: "D01_rep0", items: allItems(dir, "y"), overall: null, note: "" }],
      ctx(dir),
    );
    expect(skipped).toEqual([]);
    expect(rows.map((r) => r.overall)).toEqual([null, null]);
  });
});
