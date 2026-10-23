/** report.md for the rules-puzzle eval (#677). */
import type { EvalRunPost } from "../post";
import { wilson } from "../stats";
import type { PuzzleError, PuzzleRow } from "./pipeline";
import { PUZZLE_TYPES, type Puzzle } from "./types";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export type Score = { n: number; correct: number; accuracy: number; interval: [number, number] };

export function scoreOf(rows: readonly PuzzleRow[]): Score {
  const correct = rows.filter((r) => r.correct).length;
  return { n: rows.length, correct, accuracy: rows.length ? correct / rows.length : 0, interval: wilson(correct, rows.length) };
}

const scoreText = (s: Score) => `${pct(s.accuracy)} (${s.correct}/${s.n}, 95% Wilson ${pct(s.interval[0])} to ${pct(s.interval[1])})`;

/** The run's headline number: the share of puzzles answered exactly right. */
export function headline(rows: readonly PuzzleRow[], errors: readonly PuzzleError[], spent: number): string {
  return `puzzles: ${scoreText(scoreOf(rows))}, ${errors.length} errors, ${usd(spent)}`;
}

/** The run as POST /admin/evals takes it (#679): puzzles answered exactly right out of puzzles answered (as the headline counts them, no answer is wrong), by type. */
export function puzzlesRunPayload(i: { variant: string; model: string; rows: readonly PuzzleRow[]; errors?: readonly PuzzleError[]; notes?: string }): EvalRunPost {
  const score = scoreOf(i.rows);
  const groups: NonNullable<EvalRunPost["groups"]> = {};
  for (const type of PUZZLE_TYPES) {
    const s = scoreOf(i.rows.filter((r) => r.type === type));
    if (s.n) groups[type] = { correct: s.correct, total: s.n };
  }
  return {
    suite: "puzzles",
    run_at: new Date().toISOString(),
    label: i.variant,
    model: i.model,
    correct: score.correct,
    total: score.n,
    groups,
    spend_usd: Math.round(i.rows.reduce((s, r) => s + r.cost_usd, 0) * 100) / 100,
    notes: i.notes ?? `${score.n} puzzles answered, ${i.rows.filter((r) => !r.parsed).length} without a usable answer, ${i.errors?.length ?? 0} errors`,
  };
}

/** Wrong answers worth reading first: no usable answer, then the rest in puzzle order. */
export function worstMisses(rows: readonly PuzzleRow[], n = 10): PuzzleRow[] {
  return rows.filter((r) => !r.correct).sort((a, b) => Number(a.parsed) - Number(b.parsed)).slice(0, n);
}

export type ReportInput = {
  variant: string;
  mode: "anthropic" | "scripted";
  model: string;
  source: string;
  puzzles: readonly Puzzle[];
  rows: readonly PuzzleRow[];
  errors: readonly PuzzleError[];
  stoppedAtCap: boolean;
  maxUsd: number;
};

export function renderReport(i: ReportInput): string {
  const spent = i.rows.reduce((s, r) => s + r.cost_usd, 0);
  const out: string[] = [`# Rules puzzles: ${i.variant}`, ""];
  if (i.mode === "scripted") out.push("> Dry run: the answers are scripted (about one in four is deliberately wrong), so these numbers say nothing about Log Pose.", "");
  out.push(
    `**Headline: ${scoreText(scoreOf(i.rows))}**`,
    "",
    `Source: ${i.source}. Model: ${i.model}. Spend: ${usd(spent)} of ${usd(i.maxUsd)}.${i.stoppedAtCap ? " Stopped at the spend cap." : ""} Puzzles generated: ${i.puzzles.length}; answered: ${i.rows.length}; errors: ${i.errors.length}.`,
    "",
    "## Accuracy by type",
    "",
    "| Type | Puzzles | Correct | Accuracy | 95% Wilson | No answer |",
    "|---|---:|---:|---:|---|---:|",
  );
  for (const type of PUZZLE_TYPES) {
    const rows = i.rows.filter((r) => r.type === type);
    if (!rows.length) continue;
    const s = scoreOf(rows);
    out.push(`| ${type} | ${s.n} | ${s.correct} | ${pct(s.accuracy)} | ${pct(s.interval[0])} to ${pct(s.interval[1])} | ${rows.filter((r) => !r.parsed).length} |`);
  }
  const all = scoreOf(i.rows);
  out.push(`| **all** | ${all.n} | ${all.correct} | ${pct(all.accuracy)} | ${pct(all.interval[0])} to ${pct(all.interval[1])} | ${i.rows.filter((r) => !r.parsed).length} |`, "");

  const split = (label: string, rows: readonly PuzzleRow[]) => (rows.length ? `| ${label} | ${scoreOf(rows).n} | ${pct(scoreOf(rows).accuracy)} | ${pct(scoreOf(rows).interval[0])} to ${pct(scoreOf(rows).interval[1])} |` : "");
  out.push(
    "## New sets (OP18, EB05) against older cards",
    "",
    "| Cards | Puzzles | Accuracy | 95% Wilson |",
    "|---|---:|---:|---|",
    ...[split("a card from OP18 or EB05 is in the position", i.rows.filter((r) => r.newSet)), split("older cards only", i.rows.filter((r) => !r.newSet))].filter(Boolean),
    "",
  );

  const tags = new Map<string, PuzzleRow[]>();
  for (const r of i.rows) for (const t of r.tags) tags.set(`${r.type}: ${t}`, [...(tags.get(`${r.type}: ${t}`) ?? []), r]);
  out.push("## By kind of position", "", "| Kind | Puzzles | Accuracy | 95% Wilson |", "|---|---:|---:|---|");
  for (const [tag, rows] of [...tags].sort(([a], [b]) => a.localeCompare(b))) out.push(split(tag, rows));
  out.push("", "## Worst misses", "");
  const worst = worstMisses(i.rows);
  if (!worst.length) out.push("None.");
  for (const r of worst) out.push(`- ${r.id} [${r.tags.join(", ")}] ${cell(r.question)} Given ${cell(r.given)}${r.reason ? ` (${cell(r.reason)})` : ""}; gold ${cell(r.gold)}.`);
  if (i.errors.length) out.push("", "## Errors", "", ...i.errors.map((e) => `- ${e.id}: ${e.failure}: ${cell(e.message)}`));
  return `${out.join("\n")}\n`;
}
