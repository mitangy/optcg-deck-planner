/**
 * Asks Log Pose about one deck the way a player does (#678): the production chat loop (`runChat`: same system
 * prompt, same tools, including propose_deck_edit), with the deck open in the app's context and pasted under the
 * question. Nothing outside the model is real: the planner API is the eval's in-memory one.
 */
import type { Catalog } from "../../src/catalog";
import { costUsd, runChat, MAX_TOOL_ROUNDS, type CallModel, type Usage } from "../../src/chat";
import type { OfficialLibrary } from "../../src/official/library";
import type { DeckEditProposal } from "../../src/proposals";
import type { Knowledge } from "../../src/server";
import { evalPlanner, type PlannerOptions } from "../planner";
import { withRetry } from "../retry";
import { summarizeTurn } from "../trace";
import type { AdviceCase } from "./cases";

export class ModelMismatch extends Error {}

export type AskDeps = {
  catalog: Catalog;
  library?: OfficialLibrary;
  knowledge: Pick<Knowledge, "playbook">;
  planner: PlannerOptions;
  /** The model that must serve every call. */
  model: string;
  timeoutS: number;
  retryMs?: number;
};

export type Asked = {
  answer: string;
  proposals: DeckEditProposal[];
  toolCalls: string[];
  rounds: number;
  usage: Usage;
  costUsd: number;
  model: string | undefined;
  /** The chat ran out of tool rounds before answering; the answer is whatever text came first. */
  outOfRounds: boolean;
};

const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const add = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
});

/** The chat request body for a case: the deck is open in the planner and also pasted under the question. */
export function chatBodyFor(c: AdviceCase) {
  return {
    message: c.message,
    context: {
      app: "planner" as const,
      page: "deck",
      deck: { name: c.name, leaderId: c.leaderId, cards: c.cards.map((x) => ({ id: x.id, copies: x.copies })), ref: "planner:eval" },
    },
  };
}

export async function askLogPose(deps: AskDeps, c: AdviceCase, base: CallModel): Promise<Asked> {
  const { api, captured } = evalPlanner({ ...deps.planner });
  const calls: { model?: string; usage: Usage }[] = [];
  const ceiling = AbortSignal.timeout(deps.timeoutS * 1000);
  const callModel: CallModel = async (params, onText, signal, onCite) => {
    const reply = await withRetry(() => base(params, onText, signal, onCite), { signal, baseMs: deps.retryMs });
    calls.push({ model: reply.model, usage: reply.usage });
    if (reply.model !== deps.model) throw new ModelMismatch(`call ${calls.length} was served by ${reply.model ?? "an unknown model"}, not ${deps.model}`);
    return reply;
  };
  const proposals: DeckEditProposal[] = [];
  const chatDeps = { api, catalog: deps.catalog, knowledge: { library: deps.library, playbook: deps.knowledge.playbook, stats: api }, callModel };
  let outOfRounds = false;
  try {
    await runChat(chatDeps, `chat.eval-${c.id}`, chatBodyFor(c), (e) => void (e.event === "proposal" && proposals.push(e.data as unknown as DeckEditProposal)), ceiling);
  } catch (err) {
    if (err instanceof ModelMismatch) throw err;
    if (ceiling.aborted) throw new Error(`no answer within ${deps.timeoutS}s`);
    if (calls.length >= MAX_TOOL_ROUNDS && /too many lookups/.test(err instanceof Error ? err.message : "")) outOfRounds = true;
    else throw err;
  }
  const turn = summarizeTurn(captured.turn ?? []);
  return {
    answer: turn.answer,
    proposals,
    toolCalls: turn.toolCalls.map((t) => t.name),
    rounds: calls.length,
    usage: calls.reduce((u, k) => add(u, k.usage), ZERO),
    costUsd: calls.reduce((s, k) => s + costUsd(k.usage, k.model), 0),
    model: calls[calls.length - 1]?.model,
    outOfRounds,
  };
}
