/**
 * Review-facts eval (#675): how often do Log Pose's post-game reviews state false facts about the game?
 * Bot self-play games -> the production review request -> extracted claims -> each claim checked against the replay.
 * `npm run eval:review-facts` with the real API spends money (needs ANTHROPIC_API_KEY); `--model-api scripted` is free.
 *
 *   --n <games>              default 20            --seed <n>        first self-play seed, default 1
 *   --levels normal,normal   bot levels             --decks <file>    deck list JSON (default: the meta decks file if present)
 *   --games <jsonl>          replays from a file instead of self-play (games that no longer replay are skipped)
 *   --seat 0|1|both          default: alternate    --variant <name>  output folder under evals/out/review-facts
 *   --model <id>             review model, default CHAT_MODEL        --extractor-model <id>   default claude-haiku-5-5
 *   --max-usd <n>            stop dispatching past this measured spend (default 5)      --concurrency <n>   default 3
 *   --model-api anthropic|scripted
 *   --post                   send the run to the admin page as the review_facts suite (needs ANALYST_API_URL + ANALYST_SERVICE_SECRET; not in a dry run)
 */
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BotLevel, MatchReplay, Seat } from "@optcg/rules";
import { runSelfPlay } from "@optcg/rules/src/sim/selfPlay";
import { parseJsonl } from "../../src/botGames";
import { loadCatalog } from "../../src/catalog";
import { anthropicModel, CHAT_MODEL } from "../../src/chat";
import { scriptedModel, textReply } from "../scripted";
import { EXTRACTOR_MODEL, anthropicExtractor, scriptedExtractor } from "./extract";
import { gameFacts } from "./facts";
import { evaluateReview, scriptedReview, type ClaimRow, type ReviewRow } from "./pipeline";
import { postEvalRun } from "../post";
import { renderReport, reviewFactsRunPayload } from "./report";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const META_DECKS = "/mnt/project-files/self-play-bots/meta-decks-2026-10-18.json";

const { values: f } = parseArgs({
  options: {
    n: { type: "string", default: "20" },
    seed: { type: "string", default: "1" },
    levels: { type: "string", default: "normal,normal" },
    decks: { type: "string" },
    games: { type: "string" },
    seat: { type: "string", default: "alternate" },
    variant: { type: "string" },
    model: { type: "string" },
    "extractor-model": { type: "string" },
    "max-usd": { type: "string", default: "5" },
    concurrency: { type: "string", default: "3" },
    "model-api": { type: "string", default: "anthropic" },
    post: { type: "boolean", default: false },
  },
});

const scripted = f["model-api"] === "scripted";
if (!scripted && f["model-api"] !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
if (!scripted && !process.env.ANTHROPIC_API_KEY) {
  console.error("npm run eval:review-facts spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted.");
  process.exit(2);
}
if (!["alternate", "0", "1", "both"].includes(f.seat!)) throw new Error("--seat must be 0, 1 or both");
const n = Number(f.n);
const seed = Number(f.seed);
const maxUsd = Number(f["max-usd"]);
const variant = f.variant ?? (scripted ? "dry-run" : "baseline");
const model = f.model ?? CHAT_MODEL;
const extractorModel = f["extractor-model"] ?? EXTRACTOR_MODEL;

// Games: from a file, or fresh self-play with fixed seeds (only games that finished).
let replays: MatchReplay[];
let source: string;
if (f.games) {
  const parsed = parseJsonl(readFileSync(f.games, "utf8"));
  replays = [];
  for (const { replay } of parsed.replays) {
    if (replays.length >= n) break;
    if (replay.end && !gameFacts(replay).divergedAt) replays.push(replay);
  }
  source = `${f.games} (${replays.length} games that replay and finished)`;
} else {
  const [a, b] = f.levels!.split(",") as BotLevel[];
  const deckFile = f.decks ?? (existsSync(META_DECKS) ? META_DECKS : undefined);
  const decks = deckFile ? JSON.parse(readFileSync(deckFile, "utf8")) : undefined;
  const made: MatchReplay[] = [];
  runSelfPlay({ games: n + Math.ceil(n / 2) + 5, seed, levels: [a ?? "normal", b ?? a ?? "normal"], decks, onReplay: (r) => made.push(r) });
  replays = made.filter((r) => r.end).slice(0, n);
  source = `self-play ${f.levels}, seeds from ${seed}, ${deckFile ? `decks ${deckFile}` : "random decks"}`;
}
if (!replays.length) throw new Error("No finished games to review.");

const catalog = loadCatalog();
const client = scripted ? null : new Anthropic();
const extractor = client ? anthropicExtractor(client as never, extractorModel) : scriptedExtractor;

type Unit = { id: string; replay: MatchReplay; seat: Seat; index: number };
const units: Unit[] = replays.flatMap((replay, i) => {
  const seats: Seat[] = f.seat === "both" ? [0, 1] : f.seat === "alternate" ? [(i % 2) as Seat] : [Number(f.seat) as Seat];
  return seats.map((seat) => ({ id: `g${i + 1}-seed${replay.seed}-seat${seat}`, replay, seat, index: i }));
});

const dir = join(here("../out/review-facts"), variant);
mkdirSync(dir, { recursive: true });
const reviewsFile = join(dir, "reviews.jsonl");
const claimsFile = join(dir, "claims.jsonl");
writeFileSync(reviewsFile, "");
writeFileSync(claimsFile, "");

const rows: ReviewRow[] = [];
const claims: ClaimRow[] = [];
const errors: { id: string; message: string }[] = [];
let spent = 0;
let next = 0;
let stoppedAtCap = false;
const realModel = client ? anthropicModel(client as never) : null;
const worker = async () => {
  for (;;) {
    if (spent >= maxUsd) {
      stoppedAtCap = next < units.length;
      return;
    }
    const u = units[next++];
    if (!u) return;
    try {
      const facts = gameFacts(u.replay);
      const callModel = realModel ?? scriptedModel(({ call: _call }) => textReply(scriptedReview(facts, u.seat, u.index % 2 === 1), model));
      const out = await evaluateReview({ catalog, model, callModel, extractor }, { id: u.id, replay: u.replay, seat: u.seat, facts });
      spent += out.row.review_cost_usd + out.row.extract_cost_usd;
      rows.push(out.row);
      claims.push(...out.claims);
      appendFileSync(reviewsFile, `${JSON.stringify(out.row)}\n`);
      for (const c of out.claims) appendFileSync(claimsFile, `${JSON.stringify(c)}\n`);
      console.log(`${u.id}: ${out.row.claims} claims, ${out.row.contradicted + out.row.wrong_turn} wrong, ${spent.toFixed(2)} USD so far`);
    } catch (err) {
      errors.push({ id: u.id, message: err instanceof Error ? err.message : String(err) });
      console.error(`${u.id}: ${errors[errors.length - 1]!.message}`);
    }
  }
};
await Promise.all(Array.from({ length: Math.max(1, Number(f.concurrency)) }, worker));

rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const report = renderReport({ variant, mode: scripted ? "scripted" : "anthropic", model, extractorModel: scripted ? "scripted-extractor" : extractorModel, source, rows, claims, errors, stoppedAtCap, maxUsd });
writeFileSync(join(dir, "report.md"), report);
console.log(`report: ${join(dir, "report.md")}`);
if (f.post) {
  if (scripted) console.error("--post skipped: a --model-api scripted run says nothing about Log Pose.");
  else if (!rows.length) console.error("--post skipped: no review finished.");
  else console.log((await postEvalRun(reviewFactsRunPayload({ variant, model, rows }))).message);
}
process.exit(errors.length ? 1 : 0);
