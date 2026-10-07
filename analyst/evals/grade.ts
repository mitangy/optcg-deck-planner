/** One answer through every grader: correct (by group), cited, grounded and, for D, the rubric. */
import type { Catalog } from "../src/catalog";
import { citationCheck } from "./grade/citations";
import { checkEdits } from "./grade/edits";
import { gradeC, gradeVerdict, type Graded } from "./grade/exact";
import { grounded } from "./grade/grounding";
import { rubricScore, type Judge, type JudgeMeta } from "./grade/judge";
import type { EvalCase, Gold, Grade, Rubric, Verdict } from "./types";
import type { TurnSummary } from "./trace";

export type Gradable = Pick<TurnSummary, "answer" | "citations" | "toolText" | "userText">;

export type GradeResult = {
  grade: Grade;
  explanation: Record<string, string>;
  judged: JudgeMeta[];
  /** The judge's item scores for a D answer, kept in the trace for Miko's grading. */
  rubric?: Rubric;
};

/** A rubric score at or above this, with every programmatic check passing, is a correct D answer. */
export const RUBRIC_PASS = 0.8;

const UNCLEAR: Verdict = { verdict: "unclear", legal: "unclear", says_no_official_ruling: false, can: [], cannot: [] };

export async function gradeAnswer(
  c: EvalCase,
  gold: Gold,
  t: Gradable,
  deps: { catalog: Catalog; judge: Judge; extraBanProblems?: (cards: { id: string; copies: number }[], leaderId: string | null) => string[] },
): Promise<GradeResult> {
  const judged: JudgeMeta[] = [];
  const explanation: Record<string, string> = {};
  const note = (m: JudgeMeta) => void judged.push(m);

  const cites = citationCheck(t.citations, gold.cites);
  if (!cites.ok) explanation.cited = [...cites.missing.map((g) => `no citation of ${g.join(" or ")}`), ...cites.forbidden.map((s) => `cited ${s}`)].join("; ");
  const ground = grounded(t.answer, { tools: t.toolText, user: t.userText }, { catalog: deps.catalog });
  if (!ground.ok) explanation.grounded = `not in any tool result or the question: ${ground.ungrounded.join(", ")}`;

  let correct: Graded;
  let rubric: number | undefined;
  let items: Rubric | undefined;
  if (!t.answer.trim()) {
    correct = { correct: 0, why: "the answer is empty" };
  } else if (c.group === "D" || c.group === "E") {
    const r = await deps.judge.rubric({ question: c.question, answer: t.answer, toolResults: t.toolText, deck: c.deck, focus: c.focus });
    note(r);
    rubric = rubricScore(r.rubric);
    items = r.rubric;
    const failed = Object.entries(r.rubric).filter(([, i]) => i.pass === false).map(([id, i]) => `${id}: ${i.why}`);
    const problems: string[] = [];
    for (const check of c.checks ?? []) {
      if (check === "edits_legal") {
        const e = checkEdits(deps.catalog, c.deck ?? "", t.answer, deps.extraBanProblems);
        if (!e.legal) problems.push(`edits_legal: ${e.problems.join("; ")}`);
      } else {
        const g = grounded(t.answer, { tools: t.toolText, user: t.userText }, { catalog: deps.catalog, percentsOnly: true });
        if (!g.ok) problems.push(`no_invented_rate: ${g.ungrounded.join(", ")}`);
      }
    }
    const pass = rubric >= RUBRIC_PASS && problems.length === 0;
    correct = { correct: pass ? 1 : 0, why: [`rubric ${rubric.toFixed(2)}`, ...failed, ...problems].join("; ") };
  } else {
    const needsVerdict = c.group !== "C" ? Boolean(gold.verdict || gold.can?.length || gold.cannot?.length) : gold.legal !== undefined;
    let v = UNCLEAR;
    if (needsVerdict) {
      const r = await deps.judge.extractVerdict({ question: c.question, answer: t.answer });
      note(r);
      v = r.verdict;
    }
    correct = c.group === "C" ? gradeC(gold, t.answer, v, deps.catalog) : gradeVerdict(gold, t.answer, v, deps.catalog);
  }
  explanation.correct = correct.why;
  return {
    grade: { correct: correct.correct, cited: cites.ok ? 1 : 0, grounded: ground.ok ? 1 : 0, ...(rubric === undefined ? {} : { rubric }) },
    explanation,
    judged,
    ...(items ? { rubric: items } : {}),
  };
}
