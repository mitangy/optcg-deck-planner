/**
 * Human grading of the D answers (#1038). Miko grades on a web page, blind to the judge: `exportForGrading` builds
 * what the page shows (no rubric), `toHumanGrades` turns the page's grades into human-grades.jsonl rows, and
 * `judgeAgreement` compares them with the judge's rubric.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "./cases";
import { rubricItems } from "../grade/judge";
import { shareable } from "../grade/overlap";
import { resultText, summarizeTurn } from "../shared/trace";
import type { Message } from "../../src/chat";
import type { Rubric } from "./types";

export type HumanGrade = {
  case: string;
  rep?: number;
  run: string;
  git_sha: string;
  answer_sha256: string;
  answer?: string;
  items: Record<string, 0 | 1 | null>;
  overall: number | null;
  note: string;
  grader: "miko";
  graded_at: string;
};

export type GradingItem = { key: string; case: string; rep: number; question: string; deck?: string; answer: string; sources: string[]; tools: ToolStep[]; items: Record<string, string> };
export type ToolStep = { name: string; input: string; result: string };
export type PageGrade = { key: string; items: Record<string, "y" | "n" | "na">; overall?: number | null; note: string };
type Trace = { case: string; rep: number; turn: Message[]; rubric?: Rubric };

const readJsonl = <T>(file: string): T[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : []);
const readTraces = (dir: string): Trace[] => {
  const out: Trace[] = [];
  for (const c of CASES.filter((x) => x.group === "D")) {
    for (let rep = 0; ; rep++) {
      const f = join(dir, "traces", `${c.id}_rep${rep}.json`);
      if (!existsSync(f)) break;
      out.push(JSON.parse(readFileSync(f, "utf8")) as Trace);
    }
  }
  return out;
};

/** The judge's rubric per "<case>_rep<rep>" key, read from a run's traces. */
export function judgeRubrics(dir: string): Record<string, Rubric> {
  return Object.fromEntries(readTraces(dir).flatMap((t) => (t.rubric ? [[`${t.case}_rep${t.rep}`, t.rubric]] : [])));
}

/** Everything the grading page shows. The judge's rubric is left out on purpose: grading is blind. */
export function exportForGrading(dir: string): GradingItem[] {
  return readTraces(dir).flatMap((t) => {
    const c = CASES.find((x) => x.id === t.case);
    if (!c || c.group !== "D") return [];
    const s = summarizeTurn(t.turn);
    return [{
      key: `${t.case}_rep${t.rep}`,
      case: t.case,
      rep: t.rep,
      question: c.question,
      ...(c.deck ? { deck: c.deck } : {}),
      answer: s.answer,
      sources: [...new Set(s.citations.map((x) => x.source))],
      tools: toolSteps(t.turn),
      items: rubricItems(c.focus),
    }];
  });
}

export const RESULT_CAP = 6000;

/** Each tool call of the turn in order: name, compact input and the result text (cut at RESULT_CAP chars). */
export function toolSteps(turn: readonly Message[]): ToolStep[] {
  const blocks = turn.flatMap((m) => (typeof m.content === "string" ? [] : (m.content as Record<string, unknown>[])));
  const results = new Map(blocks.filter((b) => b.type === "tool_result").map((b) => [String(b.tool_use_id), resultText(b as never)]));
  return blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => {
      const r = results.get(String(b.id)) ?? "";
      return { name: String(b.name), input: JSON.stringify(b.input ?? {}), result: r.length > RESULT_CAP ? `${r.slice(0, RESULT_CAP)}… (cut)` : r };
    });
}

type Ctx = { dir: string; run: string; gitSha: string; now: string };

/** Page grades to rows. A grade with an unanswered item, or an overall that is present but not an integer 1-5, is skipped and listed in `skipped`. A missing overall is kept as null. */
export function toHumanGrades(pageGrades: PageGrade[], ctx: Ctx): { rows: HumanGrade[]; skipped: { key: string; why: string }[] } {
  const exported = new Map(exportForGrading(ctx.dir).map((x) => [x.key, x]));
  const traces = new Map(readTraces(ctx.dir).map((t) => [`${t.case}_rep${t.rep}`, t]));
  const results = readJsonl<{ case: string; rep: number; answer_sha256?: string }>(join(ctx.dir, "results.jsonl"));
  const rows: HumanGrade[] = [];
  const skipped: { key: string; why: string }[] = [];
  for (const g of pageGrades) {
    const e = exported.get(g.key);
    if (!e) {
      skipped.push({ key: g.key, why: "unknown answer" });
      continue;
    }
    const missing = Object.keys(e.items).find((id) => !["y", "n", "na"].includes(g.items?.[id] as string));
    if (missing) {
      skipped.push({ key: g.key, why: `item ${missing} not answered` });
      continue;
    }
    const overall = g.overall ?? null;
    if (overall !== null && (!Number.isInteger(overall) || overall < 1 || overall > 5)) {
      skipped.push({ key: g.key, why: "overall out of range" });
      continue;
    }
    const s = summarizeTurn(traces.get(g.key)!.turn);
    rows.push({
      case: e.case,
      rep: e.rep,
      run: ctx.run,
      git_sha: ctx.gitSha,
      answer_sha256: results.find((r) => r.case === e.case && r.rep === e.rep)?.answer_sha256 ?? "",
      ...(shareable(s.answer, s.toolText) ? { answer: s.answer } : {}),
      items: Object.fromEntries(Object.keys(e.items).map((id) => [id, g.items[id] === "y" ? 1 : g.items[id] === "n" ? 0 : null])),
      overall,
      note: g.note ?? "",
      grader: "miko",
      graded_at: ctx.now,
    });
  }
  return { rows, skipped };
}

/** Appends rows to the jsonl file; a line with the same run, case and rep is replaced, so re-grading overwrites. */
export function appendHumanGrades(file: string, rows: HumanGrade[]): void {
  const same = (a: HumanGrade, b: HumanGrade) => a.run === b.run && a.case === b.case && (a.rep ?? 0) === (b.rep ?? 0);
  const kept = readJsonl<HumanGrade>(file).filter((old) => !rows.some((r) => same(old, r)));
  writeFileSync(file, [...kept, ...rows].map((r) => `${JSON.stringify(r)}\n`).join(""));
}

export type ItemAgreement = { item: string; n: number; agree: number; percent: number | null; kappa: number | null; skipped: number };
export type Disagreement = { key: string; item: string; human: 0 | 1; judge: 0 | 1; judgeWhy: string; note: string };

/**
 * Cohen's kappa for two binary raters. Chance agreement pe = P(both say 1) + P(both say 0). kappa = (po - pe) / (1 - pe).
 * When both raters are constant and identical, pe is 1 and kappa is defined as 1. It is null only when there are no pairs.
 */
export function cohenKappa(pairs: [0 | 1, 0 | 1][]): number | null {
  const n = pairs.length;
  if (!n) return null;
  const po = pairs.filter(([h, j]) => h === j).length / n;
  const h1 = pairs.filter(([h]) => h === 1).length / n;
  const j1 = pairs.filter(([, j]) => j === 1).length / n;
  const pe = h1 * j1 + (1 - h1) * (1 - j1);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

const summarize = (item: string, pairs: [0 | 1, 0 | 1][], skipped: number): ItemAgreement => {
  const agree = pairs.filter(([h, j]) => h === j).length;
  return { item, n: pairs.length, agree, percent: pairs.length ? (100 * agree) / pairs.length : null, kappa: cohenKappa(pairs), skipped };
};

/** Judge-human agreement per rubric item and pooled. Items either side marks null are excluded from n and counted as skipped. */
export function judgeAgreement(rows: HumanGrade[], judgeByKey: Record<string, Rubric>): { items: ItemAgreement[]; pooled: ItemAgreement; disagreements: Disagreement[] } {
  const byItem = new Map<string, { pairs: [0 | 1, 0 | 1][]; skipped: number }>();
  const disagreements: Disagreement[] = [];
  for (const row of rows) {
    const key = `${row.case}_rep${row.rep ?? 0}`;
    const rubric = judgeByKey[key];
    if (!rubric) continue;
    for (const [id, human] of Object.entries(row.items)) {
      const j = rubric[id];
      const slot = byItem.get(id) ?? { pairs: [], skipped: 0 };
      byItem.set(id, slot);
      if (human === null || !j || j.pass === null) {
        slot.skipped++;
        continue;
      }
      const judge: 0 | 1 = j.pass ? 1 : 0;
      slot.pairs.push([human, judge]);
      if (human !== judge) disagreements.push({ key, item: id, human, judge, judgeWhy: j.why, note: row.note });
    }
  }
  const num = (id: string) => Number(id.replace(/\D/g, ""));
  const ids = [...byItem.keys()].sort((a, b) => num(a) - num(b));
  const items = ids.map((id) => summarize(id, byItem.get(id)!.pairs, byItem.get(id)!.skipped));
  const pooled = summarize("all", ids.flatMap((id) => byItem.get(id)!.pairs), ids.reduce((s, id) => s + byItem.get(id)!.skipped, 0));
  return { items, pooled, disagreements };
}

/** True when an item agrees under 90% or has kappa under 0.6. */
export const needsPromptFix = (a: ItemAgreement): boolean => a.n > 0 && ((a.percent ?? 0) < 90 || (a.kappa ?? 0) < 0.6);
