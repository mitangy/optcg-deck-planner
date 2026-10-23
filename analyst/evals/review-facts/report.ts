/** report.md for the review-facts eval (#675). */
import type { EvalRunPost } from "../post";
import { wilson } from "../stats";
import type { ClaimRow, ReviewRow } from "./pipeline";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export type Totals = {
  reviews: number;
  claims: number;
  checkable: number;
  wrong: number;
  supported: number;
  contradicted: number;
  wrong_turn: number;
  unverifiable: number;
  dropped: number;
  wrongPerReview: number;
  wrongShare: number;
  interval: [number, number];
};

/** Wrong = contradicted + wrong_turn. Checkable = supported + wrong. Unverifiable and dropped claims are in neither. */
export function totals(rows: readonly ReviewRow[]): Totals {
  const sum = (k: "claims" | "supported" | "contradicted" | "wrong_turn" | "unverifiable" | "dropped") => rows.reduce((s, r) => s + r[k], 0);
  const supported = sum("supported");
  const contradicted = sum("contradicted");
  const wrong_turn = sum("wrong_turn");
  const wrong = contradicted + wrong_turn;
  const checkable = supported + wrong;
  return {
    reviews: rows.length,
    claims: sum("claims"),
    checkable,
    wrong,
    supported,
    contradicted,
    wrong_turn,
    unverifiable: sum("unverifiable"),
    dropped: sum("dropped"),
    wrongPerReview: rows.length ? wrong / rows.length : 0,
    wrongShare: checkable ? wrong / checkable : 0,
    interval: wilson(wrong, checkable),
  };
}

/** The run as POST /admin/evals takes it (#679): wrong claims per review is the headline, lower is better; supported out of checkable is the score. */
export function reviewFactsRunPayload(i: { variant: string; model: string; rows: readonly ReviewRow[]; notes?: string }): EvalRunPost {
  const t = totals(i.rows);
  const cost = i.rows.reduce((s, r) => s + r.review_cost_usd + r.extract_cost_usd, 0);
  return {
    suite: "review_facts",
    run_at: new Date().toISOString(),
    label: i.variant,
    model: i.model,
    ...(t.checkable ? { correct: t.supported, total: t.checkable } : {}),
    metric_name: "Wrong claims per review",
    metric_value: Math.round(t.wrongPerReview * 100) / 100,
    lower_is_better: true,
    spend_usd: Math.round(cost * 100) / 100,
    notes: i.notes ?? `${t.reviews} reviews, ${t.claims} claims, ${t.wrong} wrong of ${t.checkable} checkable, ${t.unverifiable} unverifiable`,
  };
}

/** The claims most likely to be real errors: contradicted before wrong_turn. */
export function worstClaims(claims: readonly ClaimRow[], n = 10): ClaimRow[] {
  const rank = (c: ClaimRow) => (c.verdict === "contradicted" ? 0 : 1);
  return claims.filter((c) => c.verdict === "contradicted" || c.verdict === "wrong_turn").sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

export type ReportInput = {
  variant: string;
  mode: "anthropic" | "scripted";
  model: string;
  extractorModel: string;
  source: string;
  rows: readonly ReviewRow[];
  claims: readonly ClaimRow[];
  errors: readonly { id: string; message: string }[];
  stoppedAtCap: boolean;
  maxUsd: number;
};

export function renderReport(i: ReportInput): string {
  const t = totals(i.rows);
  const cost = i.rows.reduce((s, r) => s + r.review_cost_usd + r.extract_cost_usd, 0);
  const out: string[] = [`# Review facts: ${i.variant}`, ""];
  if (i.mode === "scripted") out.push("> Dry run: the reviews and the extraction are scripted, so these numbers say nothing about Log Pose.", "");
  out.push(
    `Source: ${i.source}. Review model: ${i.model}. Extractor: ${i.extractorModel}. Spend: ${usd(cost)} of ${usd(i.maxUsd)}.${i.stoppedAtCap ? " Stopped at the spend cap." : ""}`,
    "",
    "## Totals",
    "",
    `- Reviews: ${t.reviews}; claims checked: ${t.claims} (dropped, quote not in the review: ${t.dropped})`,
    `- Supported ${t.supported}, contradicted ${t.contradicted}, wrong turn ${t.wrong_turn}, unverifiable ${t.unverifiable}`,
    `- Wrong claims per review (contradicted + wrong turn): ${t.wrongPerReview.toFixed(2)}`,
    `- Wrong share of checkable claims: ${t.wrong}/${t.checkable} = ${pct(t.wrongShare)} (95% Wilson interval ${pct(t.interval[0])} to ${pct(t.interval[1])}; claims within a review are not independent, so the real interval is wider)`,
    "",
    "## Reviews",
    "",
    "| Review | Leaders | Claims | Supported | Contradicted | Wrong turn | Unverifiable | Dropped |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...i.rows.map((r) => `| ${r.id} | ${cell(r.leaders.join(" vs "))} | ${r.claims} | ${r.supported} | ${r.contradicted} | ${r.wrong_turn} | ${r.unverifiable} | ${r.dropped} |`),
    "",
    "## Worst claims",
    "",
  );
  const worst = worstClaims(i.claims);
  if (!worst.length) out.push("None.");
  for (const c of worst) out.push(`- ${c.review} [${c.verdict}] "${cell(c.quote)}" — ${cell(c.reason)}`);
  if (i.errors.length) out.push("", "## Errors", "", ...i.errors.map((e) => `- ${e.id}: ${cell(e.message)}`));
  return `${out.join("\n")}\n`;
}
