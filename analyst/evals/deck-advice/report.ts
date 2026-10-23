/** report.md for the deck-advice eval (#678), and for a side-by-side comparison. */
import type { EvalRunPost } from "../post";
import { mean } from "../stats";
import { lostSignificantly } from "./sim";
import type { Preference, PositionBias, CaseComparison } from "./compare";
import type { AnswerRow } from "./pipeline";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pts`;
const usd = (x: number) => `$${x.toFixed(2)}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export type Totals = {
  cases: number;
  sabotaged: number;
  withEdits: number;
  legal: number;
  /** Mean share of planted copies removed over the sabotaged cases (an answer with no edits counts 0). */
  meanRecall: number | null;
  /** Mean share of removed copies that were planted, over the sabotaged cases that removed anything. */
  meanPrecision: number | null;
  /** Cases whose edited deck was played (legal edits, simulation on). */
  simulated: number;
  /** Of those, the edit did not lose win rate significantly (the interval does not lie entirely below zero). */
  notLost: number;
  /** Of the simulated cases, those whose edit significantly raised win rate. */
  gained: number;
  meanChange: number | null;
};

export function totals(rows: readonly AnswerRow[]): Totals {
  const sab = rows.filter((r) => r.kind === "sabotaged" && r.recall !== null);
  const prec = sab.filter((r) => r.precision !== null);
  const played = rows.filter((r) => r.sim?.change);
  const notLost = played.filter((r) => !lostSignificantly(r.sim!.change!)).length;
  return {
    cases: rows.length,
    sabotaged: sab.length,
    withEdits: rows.filter((r) => r.edit_source !== "none").length,
    legal: rows.filter((r) => r.legal).length,
    meanRecall: sab.length ? mean(sab.map((r) => r.recall!)) : null,
    meanPrecision: prec.length ? mean(prec.map((r) => r.precision!)) : null,
    simulated: played.length,
    notLost,
    gained: played.filter((r) => r.sim!.change!.lo > 0).length,
    meanChange: played.length ? mean(played.map((r) => r.sim!.change!.diff)) : null,
  };
}

/**
 * The run as POST /admin/evals takes it (#679): mean sabotage recall (as a percent, higher is better) is the headline; the score is
 * the simulated cases whose edit did not lose win rate significantly out of the simulated cases, so it is left out with --no-sim.
 */
export function deckAdviceRunPayload(i: { variant: string; model: string; rows: readonly AnswerRow[]; notes?: string }): EvalRunPost {
  const t = totals(i.rows);
  const groups: NonNullable<EvalRunPost["groups"]> = {};
  for (const kind of ["meta", "sabotaged"] as const) {
    const played = i.rows.filter((r) => r.kind === kind && r.sim?.change);
    if (played.length) groups[kind] = { correct: played.filter((r) => !lostSignificantly(r.sim!.change!)).length, total: played.length };
  }
  const round1 = (x: number) => Math.round(x * 1000) / 10;
  return {
    suite: "deck_advice",
    run_at: new Date().toISOString(),
    label: i.variant,
    model: i.model,
    ...(t.meanRecall === null ? {} : { metric_name: "Mean sabotage recall (%)", metric_value: round1(t.meanRecall), lower_is_better: false }),
    ...(t.simulated ? { correct: t.notLost, total: t.simulated, groups } : {}),
    spend_usd: Math.round(i.rows.reduce((s, r) => s + r.cost_usd, 0) * 100) / 100,
    notes:
      i.notes ??
      `${t.cases} cases, ${t.sabotaged} sabotaged; recall ${t.meanRecall === null ? "n/a" : pct1(t.meanRecall)}, precision ${t.meanPrecision === null ? "n/a" : pct1(t.meanPrecision)}; edits ${t.withEdits}/${t.cases}, legal ${t.legal}/${t.withEdits}; score = edit did not lose win rate significantly, of ${t.simulated} simulated`,
  };
}

export type ReportInput = {
  variant: string;
  mode: "anthropic" | "scripted";
  model: string;
  source: string;
  rows: readonly AnswerRow[];
  errors: readonly { id: string; message: string }[];
  stoppedAtCap: boolean;
  maxUsd: number;
  /** Simulation settings, or null when --no-sim. */
  sim: { gamesPerOpponent: number; opponents: number; levels: string } | null;
  banListChecked: boolean;
  seconds?: number;
};

const rates = (r: AnswerRow) => (r.sim ? `${pct(r.sim.before.winRate)} > ${r.sim.after ? pct(r.sim.after.winRate) : "-"}${r.sim.ceiling ? ` (${pct(r.sim.ceiling.winRate)})` : ""}` : "-");

const change = (r: AnswerRow) => {
  const c = r.sim?.change;
  return c ? `${pp(c.diff)} [${pp(c.lo)}, ${pp(c.hi)}]` : r.sim ? "no legal edit" : "not run";
};

export function renderReport(i: ReportInput): string {
  const t = totals(i.rows);
  const cost = i.rows.reduce((s, r) => s + r.cost_usd, 0);
  const out: string[] = [`# Deck advice: ${i.variant}`, ""];
  if (i.mode === "scripted") out.push("> Dry run: the answers come from a scripted fake model, so these numbers say nothing about Log Pose.", "");
  out.push(
    `Source: ${i.source}. Model: ${i.model}. Spend: ${usd(cost)} of ${usd(i.maxUsd)}.${i.stoppedAtCap ? " Stopped at the spend cap." : ""}${i.banListChecked ? "" : " The ban list was not checked (not loaded), so edited decks are checked for rules only."}`,
    i.sim
      ? `Simulation: ${i.sim.gamesPerOpponent} games against each of ${i.sim.opponents} meta decks per version (${i.sim.gamesPerOpponent * i.sim.opponents} games), bots ${i.sim.levels} (yours first), same seeds and seats for every version of a deck.${i.seconds ? ` Run time ${Math.round(i.seconds)} s.` : ""}`
      : "Simulation: off (--no-sim).",
    "",
    "## Headline",
    "",
    `- Mean sabotage recall: ${t.meanRecall === null ? "n/a (no sabotaged cases)" : `${pct1(t.meanRecall)} of the planted copies taken out, over ${t.sabotaged} sabotaged cases (an answer with no edits counts 0)`}`,
    `- Mean sabotage precision: ${t.meanPrecision === null ? "n/a" : `${pct1(t.meanPrecision)} of the copies the edits removed were planted`}`,
    i.sim
      ? `- Edit did not lose win rate significantly: ${t.notLost}/${t.simulated} simulated cases (the 95% interval of the change does not lie below zero); ${t.notLost}/${t.cases} counting a case with no edits or an illegal edit as a failure`
      : "- Edit did not lose win rate significantly: not measured (--no-sim)",
    ...(i.sim && t.meanChange !== null ? [`- Mean win rate change over simulated cases: ${pp(t.meanChange)}; edits that raised win rate significantly: ${t.gained}`] : []),
    `- Answers with edits: ${t.withEdits}/${t.cases}; edited deck legal: ${t.legal}/${t.withEdits}`,
    "",
    "## Cases",
    "",
    "| Case | Leader | Planted | Edits (source) | Legal | Recall | Precision | Win rate before > after (ceiling) | Change [95%] | Ceiling gap |",
    "|---|---|---:|---|---|---:|---:|---|---|---|",
    ...i.rows.map(
      (r) =>
        `| ${r.case} | ${r.leader} | ${r.k ?? "-"} | ${r.edits.length ? `${r.edits.length} lines (${r.edit_source})` : "none"} | ${r.legal ? "yes" : r.edit_source === "none" ? "no edits" : cell(r.problems[0] ?? "no")} | ${pct(r.recall)} | ${pct(r.precision)} | ${rates(r)} | ${change(r)} | ${r.sim?.vs_ceiling ? `${pp(r.sim.vs_ceiling.diff)} [${pp(r.sim.vs_ceiling.lo)}, ${pp(r.sim.vs_ceiling.hi)}]` : "-"} |`,
    ),
    "",
    "Win rate change is the edited deck minus the deck the player had, over finished games, with a two-proportion (Newcombe) interval; games are not independent across opponents, so treat the interval as optimistic. Ceiling gap is the edited deck minus the original meta deck (sabotaged cases only): 0 means the advice undid the damage.",
  );
  const bad = i.rows.filter((r) => r.sim?.change && lostSignificantly(r.sim.change));
  if (bad.length) out.push("", "## Edits that lost win rate", "", ...bad.map((r) => `- ${r.case}: ${change(r)}`));
  if (i.errors.length) out.push("", "## Errors", "", ...i.errors.map((e) => `- ${e.id}: ${cell(e.message)}`));
  return `${out.join("\n")}\n`;
}

export type CompareReportInput = {
  a: string;
  b: string;
  mode: "anthropic" | "scripted";
  judgeModel: string;
  results: readonly CaseComparison[];
  preference: Preference;
  bias: PositionBias;
  skipped: string[];
  spent: number;
  maxUsd: number;
  stoppedAtCap: boolean;
  revealed: boolean;
};

export function renderCompareReport(i: CompareReportInput): string {
  const p = i.preference;
  const out: string[] = [`# Deck advice comparison: ${i.a} vs ${i.b}`, ""];
  if (i.mode === "scripted") out.push("> Dry run: the judge is scripted (it prefers the answer with more edit lines), so these numbers say nothing about either variant.", "");
  out.push(
    `Judge: ${i.judgeModel}${i.revealed ? ", told which cards were planted" : ""}. Spend: ${usd(i.spent)} of ${usd(i.maxUsd)}.${i.stoppedAtCap ? " Stopped at the spend cap." : ""} Order of the two answers is random per case; some cases are judged in both orders (a verdict that changes with the order counts as a tie).`,
    "",
    "## Headline",
    "",
    `- ${i.b} preferred over ${i.a}: ${p.b} of ${p.a + p.b} decisive cases = ${pct(p.bRate)}${p.bRate === null ? "" : ` (95% Wilson interval ${pct1(p.interval[0])} to ${pct1(p.interval[1])})`}; ${p.a} for ${i.a}, ${p.ties} ties, ${p.cases} cases`,
    ...(p.invalid ? [`- ${p.invalid} judge replies were not a verdict and were counted as ties`] : []),
    p.bRate === null
      ? "- No case had a decisive verdict."
      : p.interval[0] <= 0.5 && p.interval[1] >= 0.5
        ? "- The interval includes 50%: no preference between the variants shown."
        : p.bRate > 0.5
          ? `- ${i.b} is preferred beyond noise.`
          : `- ${i.a} is preferred beyond noise.`,
    "",
    "## Position bias",
    "",
    i.bias.pairs
      ? `- ${i.bias.pairs} cases judged in both orders; the verdict changed with the order in ${pct(i.bias.flipRate)} of them; slot bias ${i.bias.slotBias === null ? "n/a" : i.bias.slotBias.toFixed(2)} (+1 always picks the first answer shown, -1 always the second, 0 neither)`
      : "- No case was judged in both orders.",
    "",
    "## Cases",
    "",
    "| Case | Verdict | Orders judged | Reason |",
    "|---|---|---|---|",
    ...i.results.map((r) => `| ${r.case} | ${r.verdict === "tie" ? "tie" : r.verdict === "A" ? i.a : i.b} | ${r.judgments.map((j) => j.order).join(", ")} | ${cell(r.judgments[0]?.why ?? "").slice(0, 160)} |`),
  );
  if (i.skipped.length) out.push("", "## Skipped", "", ...i.skipped.map((s) => `- ${s}`));
  return `${out.join("\n")}\n`;
}
