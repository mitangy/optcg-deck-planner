/**
 * Deck-advice eval (#678): is Log Pose's deck advice any good, judged by things with outside ground truth?
 * Meta decks as they are, and sabotaged copies with known planted cards, go through the production chat; the
 * edits are scored by what share of the sabotage they undo and by bot simulation against the meta field.
 * `npm run eval:deck-advice` with the real API spends money (needs ANTHROPIC_API_KEY); `--model-api scripted` is free.
 *
 *   --cases all|meta|sabotaged   default all     --n <cases>   a seeded pick of n cases (default: all)
 *   --seed <n>                   sabotage, case pick and simulation seeds (default 1)
 *   --decks <file>               meta deck list JSON (default: the meta decks file if present)
 *   --sim-games <G>              games per opponent per version (default: enough for about 300 per version)
 *   --no-sim                     skip the simulation        --levels normal,normal  bot levels (yours, opponent's)
 *   --sim-threads <n>            worker threads for games, 0 = in this process (default: cores - 1, at most 4)
 *   --variant <name>             output folder under evals/out/deck-advice (default baseline; dry-run when scripted)
 *   --model <id>                 chat model, default CHAT_MODEL      --library live|none   ban list and rulings (default live; none when scripted)
 *   --max-usd <n>                stop dispatching past this measured spend (default 5)    --concurrency <n>   default 3
 *   --model-api anthropic|scripted      --timeout-s <n>   per-case ceiling, default 240
 *
 *   --compare <variantA> <variantB>   side-by-side judge on two runs' answers (paid):
 *       --both-orders <share>    share of cases also judged in the other order (default 0.25)
 *       --judge-model <id>       default the D-group rubric judge (RUBRIC_MODEL)
 *       --reveal-planted         tell the judge which cards were planted   --max-usd <n>   default 5
 */
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BotLevel } from "@optcg/rules";
import { loadCatalog } from "../../src/catalog";
import { anthropicModel, CHAT_MODEL } from "../../src/chat";
import { banListProblems, type BanList } from "../../src/official/banlist";
import { OfficialLibrary, within } from "../../src/official/library";
import { loadPlaybook } from "../../src/playbook";
import { RUBRIC_MODEL } from "../grade/judge";
import type { PlannerOptions, StatsFixtures, TournamentFixtures } from "../planner";
import { anthropicPairLlm, judgeCase, judgedBothWays, judgmentCost, positionBias, preference, scriptedPairLlm, type CaseComparison } from "./compare";
import { buildCases, type AdviceCase, type CaseMode } from "./cases";
import { evaluateCase, type AnswerRow, type SimConfig } from "./pipeline";
import { renderCompareReport, renderReport } from "./report";
import { metaFrequency, type MetaDeck } from "./sabotage";
import { scriptedAdviceModel } from "./scriptedAdvice";
import { inProcess } from "./sim";
import { simPool } from "./simPool";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const META_DECKS = "/mnt/project-files/self-play-bots/meta-decks-2026-10-18.json";
const OUT = here("../out/deck-advice");
/** Games per version the default aims for. */
const TARGET_GAMES = 300;

const { values: f, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cases: { type: "string", default: "all" },
    n: { type: "string" },
    seed: { type: "string", default: "1" },
    decks: { type: "string" },
    "sim-games": { type: "string" },
    "no-sim": { type: "boolean", default: false },
    levels: { type: "string", default: "normal,normal" },
    "sim-threads": { type: "string" },
    variant: { type: "string" },
    model: { type: "string" },
    library: { type: "string" },
    "max-usd": { type: "string", default: "5" },
    concurrency: { type: "string", default: "3" },
    "timeout-s": { type: "string", default: "240" },
    "model-api": { type: "string", default: "anthropic" },
    compare: { type: "boolean", default: false },
    "both-orders": { type: "string", default: "0.25" },
    "judge-model": { type: "string" },
    "reveal-planted": { type: "boolean", default: false },
  },
});

const scripted = f["model-api"] === "scripted";
if (!scripted && f["model-api"] !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
if (!scripted && !process.env.ANTHROPIC_API_KEY) {
  console.error("npm run eval:deck-advice spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted.");
  process.exit(2);
}
const seed = Number(f.seed);
const maxUsd = Number(f["max-usd"]);
const concurrency = Math.max(1, Number(f.concurrency));
const readJsonl = <T>(file: string): T[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

if (f.compare) {
  await compareRuns();
} else {
  await generate();
}

async function compareRuns() {
  const [a, b] = positionals;
  if (!a || !b) {
    console.error("usage: npm run eval:deck-advice -- --compare <variantA> <variantB>");
    process.exit(2);
  }
  const load = (v: string) => {
    const dir = join(OUT, v);
    if (!existsSync(join(dir, "answers.jsonl")) || !existsSync(join(dir, "cases.jsonl"))) {
      console.error(`No run named ${v}: expected ${dir}/cases.jsonl and answers.jsonl.`);
      process.exit(2);
    }
    return { cases: new Map(readJsonl<AdviceCase>(join(dir, "cases.jsonl")).map((c) => [c.id, c])), answers: new Map(readJsonl<AnswerRow>(join(dir, "answers.jsonl")).map((r) => [r.case, r])) };
  };
  const A = load(a);
  const B = load(b);
  const skipped: string[] = [];
  const ids: string[] = [];
  for (const [id, ra] of A.answers) {
    const rb = B.answers.get(id);
    if (!rb) skipped.push(`${id}: no answer in ${b}`);
    else if (A.cases.get(id)?.message !== B.cases.get(id)?.message) skipped.push(`${id}: the two runs asked about different decks`);
    else if (!ra.shown || !rb.shown) skipped.push(`${id}: an answer is empty`);
    else ids.push(id);
  }
  for (const id of B.answers.keys()) if (!A.answers.has(id)) skipped.push(`${id}: no answer in ${a}`);
  if (!ids.length) {
    console.error("The two runs have no case in common to compare.");
    process.exit(2);
  }
  const judgeModel = scripted ? "scripted-judge" : (f["judge-model"] ?? RUBRIC_MODEL);
  const llm = scripted ? scriptedPairLlm : anthropicPairLlm(new Anthropic() as never, { model: judgeModel });
  const share = Number(f["both-orders"]);
  const results: CaseComparison[] = [];
  let spent = 0;
  let next = 0;
  let stoppedAtCap = false;
  const worker = async () => {
    for (;;) {
      if (spent >= maxUsd) {
        stoppedAtCap = next < ids.length;
        return;
      }
      const id = ids[next++];
      if (!id) return;
      const c = A.cases.get(id)!;
      const r = await judgeCase(llm, {
        id,
        question: c.question,
        deck: c.deckText,
        a: A.answers.get(id)!.shown,
        b: B.answers.get(id)!.shown,
        planted: f["reveal-planted"] ? c.planted.map((p) => `${p.copies}x${p.id}`) : undefined,
        seed,
        bothWays: judgedBothWays(seed, id, share),
      }).catch((err) => {
        skipped.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });
      if (!r) continue;
      spent += scripted ? 0 : r.judgments.reduce((s, j) => s + judgmentCost(j, judgeModel), 0);
      results.push(r);
      console.log(`${id}: ${r.verdict === "tie" ? "tie" : r.verdict === "A" ? a : b} (${r.judgments.map((j) => j.order).join("+")}), ${spent.toFixed(2)} USD so far`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  results.sort((x, y) => x.case.localeCompare(y.case));
  const dir = join(OUT, `compare-${a}-vs-${b}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "comparisons.jsonl"), results.map((r) => `${JSON.stringify(r)}\n`).join(""));
  writeFileSync(join(dir, "report.md"), renderCompareReport({ a, b, mode: scripted ? "scripted" : "anthropic", judgeModel, results, preference: preference(results), bias: positionBias(results), skipped, spent, maxUsd, stoppedAtCap, revealed: f["reveal-planted"]! }));
  console.log(`report: ${join(dir, "report.md")}`);
}

async function generate() {
  const mode = f.cases as CaseMode;
  if (!["all", "meta", "sabotaged"].includes(mode)) throw new Error("--cases must be all, meta or sabotaged");
  const deckFile = f.decks ?? (existsSync(META_DECKS) ? META_DECKS : undefined);
  if (!deckFile) {
    console.error("No meta decks: pass --decks <json> (see `npm run meta-decks -w @optcg/analyst`).");
    process.exit(2);
  }
  const decks = JSON.parse(readFileSync(deckFile, "utf8")) as MetaDeck[];
  if (decks.length < 2) throw new Error("The meta deck list needs at least 2 decks.");
  const variant = f.variant ?? (scripted ? "dry-run" : "baseline");
  const model = f.model ?? CHAT_MODEL;
  const [la, lb] = f.levels!.split(",") as BotLevel[];
  const levels: [BotLevel, BotLevel] = [la ?? "normal", lb ?? la ?? "normal"];

  const catalog = loadCatalog();
  const client = scripted ? null : new Anthropic();
  const library = (f.library ?? (scripted ? "none" : "live")) === "none" ? undefined : new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined });
  const banList: BanList | undefined = library ? await within(library.banList(), 15_000).catch(() => undefined) : undefined;

  const cases = buildCases(catalog, decks, { mode, seed, n: f.n === undefined ? undefined : Number(f.n), banned: new Set(banList?.banned), restricted: new Set(banList?.restricted) });
  if (!cases.length) throw new Error("No cases to run.");
  const freq = metaFrequency(decks);

  const opponents = decks.length - 1;
  const gamesPerOpponent = Number(f["sim-games"] ?? Math.ceil(TARGET_GAMES / opponents));
  const threads = f["sim-threads"] === undefined ? Math.max(1, Math.min(4, cpus().length - 1)) : Number(f["sim-threads"]);
  const pool = f["no-sim"] || threads < 1 ? null : simPool(threads);
  const sim: SimConfig | null = f["no-sim"] ? null : { field: decks, games: gamesPerOpponent, seed: seed * 1_000_000, levels, run: pool?.run ?? inProcess, cache: new Map() };

  const planner: PlannerOptions = {
    mode: "fake",
    stats: JSON.parse(readFileSync(here("../fixtures/stats.json"), "utf8")) as StatsFixtures,
    tournaments: JSON.parse(readFileSync(here("../fixtures/tournaments.json"), "utf8")) as TournamentFixtures,
  };
  const dir = join(OUT, variant);
  mkdirSync(dir, { recursive: true });
  const answersFile = join(dir, "answers.jsonl");
  writeFileSync(join(dir, "cases.jsonl"), cases.map((c) => `${JSON.stringify(c)}\n`).join(""));
  writeFileSync(answersFile, "");

  const real = client ? anthropicModel(client as never) : null;
  const playbook = loadPlaybook();
  const rows: AnswerRow[] = [];
  const errors: { id: string; message: string }[] = [];
  let spent = 0;
  let next = 0;
  let stoppedAtCap = false;
  const started = Date.now();
  const worker = async () => {
    for (;;) {
      if (spent >= maxUsd) {
        stoppedAtCap = next < cases.length;
        return;
      }
      const c = cases[next++];
      if (!c) return;
      try {
        const row = await evaluateCase(
          {
            ask: { catalog, library, knowledge: { playbook }, planner, model, timeoutS: Number(f["timeout-s"]) },
            base: real ?? scriptedAdviceModel(catalog, c, freq, model),
            extraProblems: banList ? (cards, leaderId) => banListProblems(banList, cards, leaderId).map((p) => p.problem) : undefined,
            sim,
          },
          c,
        );
        spent += row.cost_usd;
        rows.push(row);
        appendFileSync(answersFile, `${JSON.stringify(row)}\n`);
        const ch = row.sim?.change;
        console.log(`${c.id}: ${row.edits.length} edits (${row.edit_source}), ${row.edit_source === "none" ? "nothing to apply" : row.legal ? "legal" : "illegal"}${row.recall === null ? "" : `, recall ${(row.recall * 100).toFixed(0)}%`}${ch ? `, win rate ${ch.diff >= 0 ? "+" : ""}${(ch.diff * 100).toFixed(1)} pts` : ""}, ${spent.toFixed(2)} USD so far`);
      } catch (err) {
        errors.push({ id: c.id, message: err instanceof Error ? err.message : String(err) });
        console.error(`${c.id}: ${errors[errors.length - 1]!.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await pool?.close();

  const order = new Map(cases.map((c, i) => [c.id, i]));
  rows.sort((x, y) => order.get(x.case)! - order.get(y.case)!);
  writeFileSync(answersFile, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const report = renderReport({
    variant,
    mode: scripted ? "scripted" : "anthropic",
    model,
    source: `${cases.length} cases (${mode}), ${decks.length} meta decks from ${deckFile}, seed ${seed}`,
    rows,
    errors,
    stoppedAtCap,
    maxUsd,
    sim: sim ? { gamesPerOpponent, opponents, levels: levels.join(" vs ") } : null,
    banListChecked: Boolean(banList),
    seconds: (Date.now() - started) / 1000,
  });
  writeFileSync(join(dir, "report.md"), report);
  console.log(`report: ${join(dir, "report.md")}`);
  process.exit(errors.length ? 1 : 0);
}
