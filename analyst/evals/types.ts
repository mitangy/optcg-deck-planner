/**
 * Log Pose eval: case, gold, grade and result types. See analyst/README.md ("Evals").
 *
 * Rule: no Bandai text in the case files. A FAQ row is referenced by card id plus `qh`, the
 * shortHash of its question (the same hash that makes `ruling:general#<hash>` ids); the official
 * answer is read live at run time and only ever written to the gitignored `out/` folder.
 */
import type { CardScenario } from "@optcg/rules/src/testing/scenario";
import type { Usage } from "../src/chat";

export type { CardScenario };

/**
 * A source id a citation must match: exact, a `*` suffix wildcard (`card:*`), or `<n>` for one or more
 * digits (`ruling:OP01-013#<n>` matches a numbered ruling but not `ruling:OP01-013#ban`).
 * `{faq}`, `{deck}` and `{errata}` are resolved by the gold at run time.
 */
export type SourceRule = string;
/** Every inner list needs at least one matching citation; `none` patterns must not match any. */
export type Cites = { all: SourceRule[][]; none?: SourceRule[] };

export type ChatContext = { app?: "duel" | "planner"; page?: string; matchId?: string };

type Base = {
  id: string;
  question: string;
  /** An OPTCGSim deck list sent under the question, as the player would paste it. */
  deck?: string;
  context?: ChatContext;
  cites: Cites;
  /** Tools the case needs; it is skipped when the chat does not offer them. */
  requiresTools?: string[];
};

export type FaqRef = { card: string; qh: string } | { general: string } | { errata: string; k: number } | { noRuling: string };

export type CaseA = Base & {
  group: "A";
  faq: FaqRef;
  verdict: "yes" | "no" | "no_ruling";
  /** Errata cases: the date the answer must give (checked against the live errata list). */
  date?: string;
};

export type CaseB = Base & {
  group: "B";
  scenario: CardScenario;
  verdict?: "yes" | "no";
  number?: number;
  /** Cards that can / cannot do the thing asked (ids), for "which of them" questions. */
  can?: string[];
  cannot?: string[];
  /** What the answer must say: a case-insensitive regex, and an example answer fragment (used by the dry-run oracle). */
  mustSay?: { re: string; example: string }[];
};

export type CExpect =
  | { kind: "legality"; legal: boolean; hint?: string; offending?: string[]; mention?: number; bannedPair?: [string, string] }
  | { kind: "ban_status"; matches: string }
  | { kind: "odds"; turn: number; percent: number; hits?: number };

export type CaseC = Base & {
  group: "C";
  tool: "analyze_deck" | "draw_odds" | "card_rulings";
  args: Record<string, unknown>;
  live?: true;
  expect: CExpect;
};

export type DCheck = "edits_legal" | "no_invented_rate";

export type CaseD = Base & {
  group: "D";
  /** Rubric items beyond the six standard ones (R7 and up). */
  focus: string[];
  checks?: DCheck[];
};

/** Extra cases gated on tools that are not on main yet. They are not counted in the 50. */
export type CaseE = Base & {
  group: "E";
  focus: string[];
  checks?: DCheck[];
};

export type EvalCase = CaseA | CaseB | CaseC | CaseD | CaseE;
export type Group = EvalCase["group"];

/** What the grading expects, derived live or from the engine. `stale` and `gold_drift` cases are not scored. */
export type Gold = {
  status: "ok" | "stale" | "gold_drift";
  reason?: string;
  cites: Cites;
  verdict?: "yes" | "no" | "no_ruling";
  legal?: boolean;
  /** Names the answer must mention one of (card ids). */
  offending?: string[];
  mention?: number;
  percent?: number;
  hits?: number;
  /** Accepted written forms of a date. */
  dates?: string[];
  number?: number;
  can?: string[];
  cannot?: string[];
  mustSay?: { re: string; example: string }[];
};

export type Verdict = {
  verdict: "yes" | "no" | "no_ruling" | "unclear";
  legal: "legal" | "not_legal" | "unclear";
  says_no_official_ruling: boolean;
  /** Cards (ids or names) the answer says can do the thing asked, and cannot. */
  can: string[];
  cannot: string[];
};

export type RubricItem = { pass: boolean | null; why: string };
export type Rubric = Record<string, RubricItem>;

export type Grade = { correct: 0 | 1; cited: 0 | 1; grounded: 0 | 1; rubric?: number };

export type RowStatus = "ok" | "truncated" | "stale" | "gold_drift" | "skipped";

export type Row = {
  case: string;
  group: Group;
  rep: number;
  status: RowStatus;
  grade?: Grade;
  explanation?: Record<string, string>;
  model?: string;
  usage?: Usage;
  judge_model?: string;
  judge_usage?: Usage;
  judge_fallback?: boolean;
  tool_calls: number;
  rounds: number;
  latency_s: number;
  cost_usd: number;
  retries: number;
  meta?: { failure?: "too_many_rounds" | "refusal"; reason?: string };
  answer_sha256?: string;
};

export type ErrorRow = {
  case: string;
  rep: number;
  failure: "api_error" | "timeout" | "model_mismatch" | "grader_error";
  message: string;
  retries: number;
};

export type RunMeta = {
  variant: string;
  git_sha: string;
  model: string;
  judge_model: string;
  prompt_sha: string;
  tools_sha: string;
  cases_sha: string;
  reps: number;
};
