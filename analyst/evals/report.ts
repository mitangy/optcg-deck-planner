/** The one-line summary, report.md, the declared metrics for the claude-api report builder, and baseline.json. */
import { judgeCostUsd } from "./grade/judge";
import type { ErrorRow, EvalCase, Row, RunMeta } from "./types";
import { caseMeans, flipped, mean, pairedDelta, score, wilson, type Metric } from "./stats";

export type Baseline = {
  created: string;
  git_sha: string;
  model: string;
  effort: string;
  judge_model: string;
  prompt_sha: string;
  tools_sha: string;
  cases_sha: string;
  reps: number;
  n: number;
  cost_usd: number;
  wall_s: number;
  groups: Record<string, { correct: number; cited: number; grounded: number; rubric?: number }>;
  cases: Record<string, { correct?: number; cited?: number; grounded?: number; rubric?: number; status: string }>;
};

const GROUPS = ["A", "B", "C", "D"] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fixed = (x: number, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString();
const inGroup = (rows: readonly Row[], g: string) => rows.filter((r) => r.group === g);
const scored = (rows: readonly Row[]) => rows.filter((r) => r.group !== "E");

export const totalCost = (rows: readonly Row[]) => rows.reduce((s, r) => s + r.cost_usd, 0);

export function summaryLine(rows: readonly Row[], errors: readonly ErrorRow[], wallS: number): string {
  const all = scored(rows);
  const correct = score(all, "correct");
  const [lo, hi] = wilson(correct.sum, correct.n);
  const per = GROUPS.map((g) => {
    const s = score(inGroup(all, g), "correct");
    return s.n ? `${g} ${fixed(s.sum)}/${s.n}` : null;
  }).filter(Boolean);
  const stale = new Set(rows.filter((r) => r.status === "stale").map((r) => r.case)).size;
  const drift = new Set(rows.filter((r) => r.status === "gold_drift").map((r) => r.case)).size;
  const minutes = Math.max(1, Math.round(wallS / 60));
  return [
    `Log Pose eval: correct ${fixed(correct.sum)}/${correct.n} (${pct(correct.mean)}, 95% CI ${Math.round(lo * 100)}-${Math.round(hi * 100)})`,
    ...per,
    `cited ${pct(score(all, "cited").mean)}`,
    `grounded ${pct(score(all, "grounded").mean)}`,
    `$${totalCost(rows).toFixed(2)}`,
    `${minutes}m`,
    `${errors.length} errors, ${stale} stale${drift ? `, ${drift} drift` : ""}`,
  ].join(" · ");
}

export function groupTable(rows: readonly Row[], baseline?: Baseline): string[] {
  const out = ["| group | n | correct | 95% CI | Δ vs baseline (paired) | cited | grounded | rubric |", "|---|---|---|---|---|---|---|---|"];
  const names: Record<string, string> = { A: "A rulings", B: "B interactions", C: "C legality/odds", D: "D matchup/build" };
  for (const g of GROUPS) {
    const rs = inGroup(rows, g);
    const s = score(rs, "correct");
    if (!s.n) continue;
    const [lo, hi] = wilson(s.sum, s.n);
    const rubric = score(rs, "rubric");
    let delta = "–";
    if (baseline) {
      const base = new Map(Object.entries(baseline.cases).filter(([id, v]) => id.startsWith(g) && v.correct !== undefined).map(([id, v]) => [id, v.correct!]));
      const d = pairedDelta(base, caseMeans(rs, "correct"));
      delta = d.n ? `${d.mean >= 0 ? "+" : ""}${fixed(d.mean, 2)} (${fixed(d.lo, 2)}..${fixed(d.hi, 2)})` : "–";
    }
    out.push(`| ${names[g]} | ${s.n} | ${fixed(s.sum)} | ${Math.round(lo * 100)}-${Math.round(hi * 100)}% | ${delta} | ${pct(score(rs, "cited").mean)} | ${pct(score(rs, "grounded").mean)} | ${rubric.n ? fixed(rubric.mean, 2) : "–"} |`);
  }
  return out;
}

export function renderReport(input: { rows: readonly Row[]; errors: readonly ErrorRow[]; meta: RunMeta; wallS: number; cases: readonly EvalCase[]; baseline?: Baseline; stoppedAtCap?: boolean }): string {
  const { rows, errors, meta, baseline } = input;
  const cost = totalCost(rows);
  const judge = rows.reduce((s, r) => s + (r.judge_usage ? judgeCostUsd(r.judge_usage, r.judge_model) : 0), 0);
  const lines: string[] = [
    `# Log Pose eval: ${meta.variant}${baseline ? " vs baseline" : ""}`,
    `model ${meta.model} · judge ${meta.judge_model} · git ${meta.git_sha.slice(0, 7)} · prompt_sha ${meta.prompt_sha.slice(0, 8)}${baseline ? (baseline.prompt_sha === meta.prompt_sha ? " (same)" : " (changed)") : ""} · tools_sha ${meta.tools_sha.slice(0, 8)}${baseline ? (baseline.tools_sha === meta.tools_sha ? " (same)" : " (changed)") : ""}`,
    `${input.cases.filter((c) => c.group !== "E").length} cases × ${meta.reps} reps · ${errors.length} errors · ${rows.filter((r) => r.status === "stale").length} stale · ${rows.filter((r) => r.status === "gold_drift").length} drift · $${cost.toFixed(2)} (model $${(cost - judge).toFixed(2)}, judge $${judge.toFixed(2)}) · ${Math.round(input.wallS)}s${input.stoppedAtCap ? " · STOPPED at --max-usd" : ""}`,
    "",
    summaryLine(rows, errors, input.wallS),
    "",
    ...groupTable(rows, baseline),
    "",
  ];
  const excluded = rows.filter((r) => ["stale", "gold_drift", "skipped"].includes(r.status));
  if (excluded.length) {
    lines.push("## Excluded from scores", ...excluded.map((r) => `- ${r.case} (${r.status}): ${r.meta?.reason ?? ""}`), "");
  }
  if (errors.length) lines.push("## Errors (not scored)", ...errors.map((e) => `- ${e.case} rep ${e.rep}: ${e.failure}: ${e.message}`), "");
  if (baseline) {
    const flips = flipped(new Map(Object.entries(baseline.cases).filter(([, v]) => v.correct !== undefined).map(([id, v]) => [id, v.correct!])), caseMeans(scored(rows), "correct"));
    lines.push("## Flipped (|Δ| ≥ 0.5)", ...(flips.length ? flips.map((f) => `- ${f.id} ${f.from} → ${f.to} [traces/${f.id}_rep0.json]`) : ["- none"]), "");
  }
  const bad = scored(rows).filter((r) => r.status === "ok" && r.grade && (r.grade.cited === 0 || r.grade.grounded === 0 || r.grade.correct === 0));
  if (bad.length) {
    lines.push("## Misses (correct, cited or grounded failed)");
    for (const r of bad) {
      const why = Object.entries(r.explanation ?? {}).filter(([k]) => (k === "correct" && r.grade!.correct === 0) || (k === "cited" && r.grade!.cited === 0) || (k === "grounded" && r.grade!.grounded === 0)).map(([k, v]) => `${k}: ${v}`).join(" | ");
      lines.push(`- ${r.case} rep ${r.rep}: ${why} [traces/${r.case}_rep${r.rep}.json]`);
    }
    lines.push("");
  }
  const flat = scored(rows).filter((r) => r.status === "ok");
  lines.push("## Per-case", "| case | reps | correct | cited | grounded | rubric | cost | tool calls | latency |", "|---|---|---|---|---|---|---|---|---|");
  for (const id of [...new Set(flat.map((r) => r.case))].sort()) {
    const rs = flat.filter((r) => r.case === id);
    const m = (metric: Metric) => {
      const v = rs.map((r) => r.grade?.[metric]).filter((x): x is number => x !== undefined);
      return v.length ? fixed(mean(v), 2) : "–";
    };
    lines.push(`| ${id} | ${rs.length} | ${m("correct")} | ${m("cited")} | ${m("grounded")} | ${m("rubric")} | $${fixed(mean(rs.map((r) => r.cost_usd)), 3)} | ${fixed(mean(rs.map((r) => r.tool_calls)), 1)} | ${fixed(mean(rs.map((r) => r.latency_s)), 1)}s |`);
  }
  return `${lines.join("\n")}\n`;
}

/** The declared metrics and perf fields the claude-api skill's report builder reads. */
export function stateFile(rows: readonly Row[], meta: RunMeta) {
  return {
    variant: meta.variant,
    metrics: ["correct", "cited", "grounded", "rubric"],
    perf: ["cost_usd", "tool_calls", "latency_s", "usage"],
    rows: rows.map((r) => ({ id: r.case, rep: r.rep, group: r.group, status: r.status, trace: `${meta.variant}/traces/${r.case}_rep${r.rep}.json`, ...(r.grade ?? {}), cost_usd: r.cost_usd, tool_calls: r.tool_calls, latency_s: r.latency_s, usage: r.usage })),
  };
}

export function baselineFrom(rows: readonly Row[], meta: RunMeta, wallS: number, effort = "medium"): Baseline {
  const all = scored(rows);
  const groups: Baseline["groups"] = {};
  for (const g of GROUPS) {
    const rs = inGroup(all, g);
    const s = score(rs, "correct");
    if (!s.n) continue;
    const rubric = score(rs, "rubric");
    groups[g] = { correct: s.mean, cited: score(rs, "cited").mean, grounded: score(rs, "grounded").mean, ...(rubric.n ? { rubric: rubric.mean } : {}) };
  }
  const cases: Baseline["cases"] = {};
  const metrics: Metric[] = ["correct", "cited", "grounded", "rubric"];
  for (const r of all) cases[r.case] ??= { status: r.status };
  for (const m of metrics) for (const [id, v] of caseMeans(all, m)) cases[id]![m] = v;
  return {
    created: new Date().toISOString().slice(0, 10),
    git_sha: meta.git_sha,
    model: meta.model,
    effort,
    judge_model: meta.judge_model,
    prompt_sha: meta.prompt_sha,
    tools_sha: meta.tools_sha,
    cases_sha: meta.cases_sha,
    reps: meta.reps,
    n: new Set(all.filter((r) => r.status === "ok").map((r) => r.case)).size,
    cost_usd: Math.round(totalCost(rows) * 100) / 100,
    wall_s: Math.round(wallS),
    groups,
    cases,
  };
}
