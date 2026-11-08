import { z } from "zod";
import { costUsd, outputConfigFor } from "./models";
import { streamTo } from "./citations";
import type { Refusal } from "./errors";
import type { Block, ChatDeps, Message, ModelReply, SseEvent, Usage } from "./types";
import type { ToolDef } from "./server";
import type { ChoiceAnswer, TurnPlan } from "./copilot";
import type { NewDeckDraft } from "./newDeck";
import type { DeckEditProposal } from "./proposals";
import { adaptToolResult, metaFor, type ClientActionName } from "./toolMeta";

export const MAX_TOOL_ROUNDS = 12;

export function apiTools(tools: ToolDef[]) {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(z.object(t.inputSchema)) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: schema };
  });
}

/** History plus a cache breakpoint on the newest block, so the next call reads the whole prefix from cache. */
function withCacheBreakpoint(messages: Message[]): Message[] {
  const out = messages.slice();
  const last = out[out.length - 1];
  if (last && Array.isArray(last.content) && last.content.length) {
    const blocks = last.content.slice();
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1]!, cache_control: { type: "ephemeral" } };
    out[out.length - 1] = { ...last, content: blocks };
  }
  return out;
}

/** What each client action carries (the SSE event of the same name), without the tool_use id the loop adds. */
type ClientActionPayloads = { proposal: DeckEditProposal; deck_draft: NewDeckDraft; plan: TurnPlan; choice: ChoiceAnswer };

/** Handlers for the tools whose result the app acts on, keyed by action. Adding an action is its payload here, `action` on the tool's `TOOL_META` entry and its handler. */
export type ClientActions = { [K in ClientActionName]?: (payload: ClientActionPayloads[K]) => void };

async function runTool(tools: ToolDef[], block: Block, clientActions?: ClientActions): Promise<Block> {
  const tool = tools.find((t) => t.name === block.name);
  const base = { type: "tool_result", tool_use_id: block.id };
  if (!tool) return { ...base, is_error: true, content: `Unknown tool ${String(block.name)}` };
  const parsed = z.object(tool.inputSchema).safeParse(block.input ?? {});
  if (!parsed.success) return { ...base, is_error: true, content: `Invalid input: ${parsed.error.message}` };
  try {
    const result = await tool.run(parsed.data as Record<string, unknown>);
    const text = result.content.map((c) => c.text).join("\n");
    const action = metaFor(tool.name)?.action;
    const handler = action && !result.isError ? (clientActions?.[action] as ((payload: unknown) => void) | undefined) : undefined;
    if (handler) handler({ id: String(block.id), ...(result.value as object) });
    // Facts become search results the model can cite; anything we can't adapt goes back as plain text.
    const sources = result.isError ? null : adaptToolResult(tool.name, result.value);
    return { ...base, ...(result.isError ? { is_error: true } : {}), content: sources ?? text };
  } catch (err) {
    return { ...base, is_error: true, content: err instanceof Error ? err.message : String(err) };
  }
}

/** The usage a failed model call had already been billed, which the error carries. */
export const partialUsageOf = (err: unknown): Usage => (err as { partialUsage?: Usage } | null)?.partialUsage ?? { input_tokens: 0, output_tokens: 0 };

const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
});

/** What the tool loop has done so far; filled in as it goes so a failed run still knows its spend. */
type RoundsState = {
  turn: Message[];
  usage: Usage;
  /** Dollars spent, priced call by call (a long Haiku 5.5 prompt costs more per token). */
  cost: number;
  finished: boolean;
  model?: string;
  /** Tool calls the model made. */
  toolCalls: number;
  /** Set when the loop stopped between rounds because a limit was reached. */
  refusal?: Refusal;
};
export const newRounds = (...turn: Message[]): RoundsState => ({ turn, usage: { input_tokens: 0, output_tokens: 0 }, cost: 0, finished: false, toolCalls: 0 });

type RoundsOptions = {
  deps: ChatDeps;
  /** The model every call of the loop runs on. */
  model: string;
  system: Record<string, unknown>[];
  tools: ToolDef[];
  /** Earlier messages sent ahead of the turn (a stored thread). */
  history?: Message[];
  emit: (e: SseEvent) => void;
  signal: AbortSignal;
  maxRounds: number;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  /** Handlers for deck edits and drafts (chat) and turn plans and choice answers (Log Pose copilot) the model proposes. */
  clientActions?: ClientActions;
  /** Asked before every round after the first with what the answer has cost so far: a limit it returns stops the loop there. */
  recheck?: (cost: number) => Promise<Refusal | null>;
  /**
   * Called when a reply has no tool calls and at least one more round fits: a message it returns is added to the turn
   * and the loop goes on instead of finishing (chat only).
   */
  afterAnswer?: (state: RoundsState) => Promise<Message | null>;
};

/**
 * The model's tool loop: call the model, run the tools it asks for, repeat until it answers or `maxRounds` run out.
 * Text and citations stream out as they arrive; the messages, the spend and whether it finished go on `state`.
 */
export async function runToolRounds(state: RoundsState, o: RoundsOptions): Promise<RoundsState> {
  // Text from separate rounds is kept apart by a blank line, as the stored thread shows it.
  let wroteText = false;
  for (let round = 0; round < o.maxRounds; round++) {
    if (round > 0 && o.recheck) {
      // One answer must not run far past the credit: stop here, between rounds, and keep what was answered.
      const refusal = await o.recheck(state.cost);
      if (refusal) {
        state.refusal = refusal;
        break;
      }
    }
    let breakPending = wroteText;
    const out = streamTo(o.emit, () => {
      wroteText = true;
    });
    let reply: ModelReply;
    try {
      reply = await o.deps.callModel(
        {
          model: o.model,
          max_tokens: o.maxTokens,
          system: o.system,
          tools: apiTools(o.tools),
          messages: withCacheBreakpoint([...(o.history ?? []), ...state.turn]),
          ...outputConfigFor(o.model, o.effort),
        },
        (delta) => {
          out.onText(breakPending ? `\n\n${delta}` : delta);
          breakPending = false;
        },
        o.signal,
        out.onCite,
      );
    } catch (err) {
      // The tokens a dropped stream had already used are still billed.
      const partial = partialUsageOf(err);
      state.usage = addUsage(state.usage, partial);
      state.cost += costUsd(partial, o.model);
      throw err;
    }
    out.flush();
    state.usage = addUsage(state.usage, reply.usage);
    state.cost += costUsd(reply.usage, reply.model ?? o.model);
    state.model = reply.model ?? state.model;
    state.turn.push({ role: "assistant", content: reply.content });
    const calls = reply.content.filter((b) => b.type === "tool_use");
    if (reply.stop_reason !== "tool_use" || calls.length === 0) {
      // Obeying a check takes two rounds (a proposal, then the final text), so add it only when two remain (#692).
      const next = o.afterAnswer && round + 2 < o.maxRounds ? await o.afterAnswer(state) : null;
      if (next) {
        state.turn.push(next);
        continue;
      }
      state.finished = true;
      break;
    }
    state.toolCalls += calls.length;
    for (const name of new Set(calls.map((c) => String(c.name)))) o.emit({ event: "status", data: { text: o.tools.find((t) => t.name === name)?.status ?? "Working" } });
    state.turn.push({ role: "user", content: await Promise.all(calls.map((c) => runTool(o.tools, c, o.clientActions))) });
  }
  return state;
}
