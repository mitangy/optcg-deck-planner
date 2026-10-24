/**
 * One puzzle through the production chat (#677): the puzzle is the player's message, `runChat` runs with the same system
 * prompt and tools as the app, and the reply's last JSON block is graded against the engine's answer. The model is injected,
 * so tests and `--model-api scripted` cost nothing.
 */
import { createHash } from "node:crypto";
import type { Catalog } from "../../src/catalog";
import { costUsd, MAX_TOOL_ROUNDS, runChat, type CallModel, type Usage } from "../../src/chat";
import type { OfficialLibrary } from "../../src/official/library";
import type { Knowledge } from "../../src/server";
import { evalPlanner, type PlannerOptions } from "../planner";
import { withRetry } from "../retry";
import { ModelMismatch } from "../runner";
import { summarizeTurn } from "../trace";
import { gradeAnswer, goldText, parseAnswer } from "./answer";
import { nameOf } from "./describe";
import type { Gold, Puzzle, PuzzleType } from "./types";

export type PuzzleRow = {
  id: string;
  type: PuzzleType;
  tags: string[];
  newSet: boolean;
  status: "ok" | "truncated";
  correct: boolean;
  /** The reply ended with a JSON block that parsed. */
  parsed: boolean;
  given: string;
  gold: string;
  reason?: string;
  question: string;
  /** The model's final text, cut to 3000 characters. */
  answer: string;
  answer_sha256: string;
  tool_calls: number;
  rounds: number;
  latency_s: number;
  cost_usd: number;
  usage: Usage;
  retries: number;
  model?: string;
};

export type PuzzleError = { id: string; failure: "api_error" | "timeout" | "model_mismatch"; message: string; retries: number };

export type AskDeps = {
  catalog: Catalog;
  library?: OfficialLibrary;
  knowledge: Pick<Knowledge, "playbook">;
  planner: PlannerOptions;
  /** The model for one puzzle. */
  callModel: (puzzle: Puzzle) => CallModel;
  /** Every call must be served by this model. */
  model: string;
  timeoutS: number;
  retryMs?: number;
};

const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const add = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
});
const msgOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function askPuzzle(deps: AskDeps, puzzle: Puzzle): Promise<PuzzleRow | PuzzleError> {
  const started = Date.now();
  const { api, captured } = evalPlanner({ ...deps.planner });
  const calls: { model?: string; stop_reason: string | null; usage: Usage }[] = [];
  let retries = 0;
  const base = deps.callModel(puzzle);
  const ceiling = AbortSignal.timeout(deps.timeoutS * 1000);
  const callModel: CallModel = async (params, onText, signal, onCite) => {
    const reply = await withRetry(() => base(params, onText, signal, onCite), { signal, baseMs: deps.retryMs, onRetry: () => retries++ });
    calls.push({ model: reply.model, stop_reason: reply.stop_reason, usage: reply.usage });
    if (reply.model !== deps.model) throw new ModelMismatch(`call ${calls.length} was served by ${reply.model ?? "an unknown model"}, not ${deps.model}`);
    return reply;
  };
  const chatDeps = { api, catalog: deps.catalog, knowledge: { library: deps.library, playbook: deps.knowledge.playbook, stats: api }, callModel };
  let ranOut = false;
  try {
    // One "user" per puzzle: the chat allows 2 simultaneous streams per user, and the eval runs more than that at once.
    await runChat(chatDeps, `chat.eval-${puzzle.id}`, { message: puzzle.message }, () => undefined, ceiling);
  } catch (err) {
    if (err instanceof ModelMismatch) return { id: puzzle.id, failure: "model_mismatch", message: err.message, retries };
    if (ceiling.aborted) return { id: puzzle.id, failure: "timeout", message: `no answer within ${deps.timeoutS}s`, retries };
    if (calls.length >= MAX_TOOL_ROUNDS && /too many lookups/.test(msgOf(err))) ranOut = true;
    else return { id: puzzle.id, failure: "api_error", message: msgOf(err), retries };
  }
  const turn = summarizeTurn(captured.turn ?? []);
  const known = puzzle.cards.map((id) => ({ id, name: nameOf(deps.catalog, id) }));
  const truncated = calls[calls.length - 1]?.stop_reason === "max_tokens";
  const parsed = parseAnswer(turn.answer);
  const graded = ranOut ? { correct: false, given: "(no answer)", reason: "ran out of tool rounds" } : gradeAnswer(puzzle.gold, parsed, known);
  const usage = calls.reduce((u, k) => add(u, k.usage), ZERO);
  return {
    id: puzzle.id,
    type: puzzle.type,
    tags: puzzle.tags,
    newSet: puzzle.newSet,
    status: truncated ? "truncated" : "ok",
    correct: graded.correct,
    parsed: parsed.ok && !ranOut,
    given: graded.given,
    gold: goldText(puzzle.gold),
    ...(graded.reason ? { reason: graded.reason } : {}),
    question: puzzle.question,
    answer: turn.answer.slice(0, 3000),
    answer_sha256: createHash("sha256").update(turn.answer).digest("hex"),
    tool_calls: turn.toolCalls.length,
    rounds: calls.length,
    latency_s: Math.round((Date.now() - started) / 100) / 10,
    cost_usd: calls.reduce((s, k) => s + costUsd(k.usage, k.model), 0),
    usage,
    retries,
    model: calls[calls.length - 1]?.model,
  };
}

export type RunOptions = { concurrency: number; maxUsd: number; onRow?: (row: PuzzleRow | PuzzleError, spent: number) => void };

/** Asks every puzzle, `concurrency` at a time, and stops dispatching once the measured spend passes `maxUsd`. */
export async function askAll(deps: AskDeps, puzzles: readonly Puzzle[], opts: RunOptions): Promise<{ rows: PuzzleRow[]; errors: PuzzleError[]; stoppedAtCap: boolean; spent: number }> {
  const rows: PuzzleRow[] = [];
  const errors: PuzzleError[] = [];
  let spent = 0;
  let next = 0;
  let stoppedAtCap = false;
  const worker = async () => {
    for (;;) {
      if (spent >= opts.maxUsd) {
        stoppedAtCap = next < puzzles.length;
        return;
      }
      const puzzle = puzzles[next++];
      if (!puzzle) return;
      const out = await askPuzzle(deps, puzzle);
      if ("failure" in out) errors.push(out);
      else {
        spent += out.cost_usd;
        rows.push(out);
      }
      opts.onRow?.(out, spent);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  const order = new Map(puzzles.map((p, i) => [p.id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { rows, errors, stoppedAtCap, spent };
}

/** FNV-1a over the id, so the dry run's mistakes are the same on every run. */
const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * The dry run's reply: right for most puzzles (lists reordered, some with card names), wrong for about one in five,
 * with no JSON block at all for one in twenty and an early wrong block before the right last one for another. Not a model.
 */
export function scriptedReply(puzzle: Puzzle, catalog: Catalog): string {
  const bucket = hash(puzzle.id) % 20;
  const { gold } = puzzle;
  const block = (value: unknown) => `\`\`\`json\n${JSON.stringify(gold.mode === "all" ? value : { [gold.key]: value })}\n\`\`\``;
  const right = (g: Gold): unknown => {
    if (g.mode === "all") return Object.fromEntries(g.parts.map((p) => [p.key, right(p)]));
    if (g.mode === "number") return g.value;
    const ids = [...g.value].reverse();
    return bucket % 2 ? ids.map((id) => `${nameOf(catalog, id)} (${id})`) : ids;
  };
  const wrong = (g: Gold): unknown => {
    // A chain is wrong in its first part only: the other parts stay right.
    if (g.mode === "all") return Object.fromEntries(g.parts.map((p, i) => [p.key, i === 0 ? wrong(p) : right(p)]));
    if (g.mode === "number") return g.value + (bucket % 2 ? 1000 : -1000);
    return g.value.length ? g.value.slice(0, -1) : ["OP01-001"];
  };
  if (bucket < 4) return `Scripted dry-run answer (deliberately wrong).\n${block(wrong(gold))}`;
  if (bucket === 4) return "Scripted dry-run answer with no JSON block.";
  if (bucket === 5) return `First thought:\n${block(wrong(gold))}\nOn reflection:\n${block(right(gold))}`;
  return `Scripted dry-run answer.\n${block(right(gold))}`;
}
