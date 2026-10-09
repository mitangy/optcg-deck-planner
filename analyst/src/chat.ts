/**
 * Log Pose in the app: the chat panel's /chat turn and the post-game /review-match, run here with the
 * Claude API. The browser holds a short-lived chat token from the planner; threads, spend and reviews
 * are kept by the planner API, and the model sees the same tools as the connector.
 */
import { z } from "zod";
import type { Catalog } from "./catalog";
import { PlannerApiError, plannerCall, reviewMatch, tokenIsValid, type PlannerApi } from "./matches";
import { newestFormat } from "./playbook";
import { buildTools, instructionsFor, type Knowledge, type ToolDef } from "./server";
import { COPILOT_INSTRUCTIONS, gameContext, gameContextBlock, PLAN_TOOL, turnPlanTool, verifyGame, type TurnPlan } from "./copilot";
import { deckEditTool, PROPOSE_TOOL, type DeckEditProposal } from "./proposals";
import { adaptToolResult, gameResults } from "./sources";

export const CHAT_MODEL = process.env.ANALYST_CHAT_MODEL || "claude-sonnet-5-5";
/** The models the planner may pick for Log Pose (its model setting); anything else falls back to CHAT_MODEL. */
export const CHAT_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-haiku-4-5"];
/** Haiku 4.5 rejects output_config.effort; every other offered model takes it. */
const NO_EFFORT_MODELS = ["claude-haiku-4-5"];
/** The request's `output_config` for a model: the effort, unless the model does not support one. */
const outputConfigFor = (model: string, effort: "low" | "medium" | "high") => (NO_EFFORT_MODELS.includes(model) ? {} : { output_config: { effort } });
export const MAX_TOOL_ROUNDS = 12;

/** Dollars per million tokens: input, output, cache reads, cache writes. */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
const OPUS_PRICE: Price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
/** Haiku 5.5 is priced by the size of one call's prompt: the first tier up to 100K tokens, the second beyond. */
const HAIKU_5_5_TIER_TOKENS = 100_000;
const HAIKU_5_5_PRICE: Price = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
const HAIKU_5_5_LONG_PRICE: Price = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 };
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": OPUS_PRICE,
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** What ONE model call cost, priced by the model that served it. An unknown model is priced as Opus, the dearest, so caps never undercount. */
export function costUsd(u: Usage, model: string = CHAT_MODEL): number {
  const m = 1_000_000;
  let price = PRICES[model] ?? OPUS_PRICE;
  if (model === "claude-haiku-5-5") {
    const prompt = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    price = prompt > HAIKU_5_5_TIER_TOKENS ? HAIKU_5_5_LONG_PRICE : HAIKU_5_5_PRICE;
  }
  return (
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      (u.cache_read_input_tokens ?? 0) * price.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    m
  );
}

type Block = Record<string, unknown> & { type: string };
export type Message = { role: "user" | "assistant"; content: string | Block[] };
/** `model` is the model that served the call (the eval checks it); optional so scripted replies need not set it. */
export type ModelReply = { content: Block[]; stop_reason: string | null; usage: Usage; model?: string };

/** A citation of one tool result, as the apps show it: which source, its title and the quoted fact. */
export type Citation = { source: string; title: string; cited_text: string };
/** A citation placed in the answer: `at` is the UTF-16 offset in the answer text it follows. */
export type PlacedCitation = Citation & { at: number };

/** One streamed model call: text deltas go to onText as they arrive, citations (of the text before them) to onCite. */
export type CallModel = (
  params: Record<string, unknown>,
  onText: (delta: string) => void,
  signal: AbortSignal,
  onCite?: (citation: Citation) => void,
) => Promise<ModelReply>;

export type SseEvent = { event: "thread" | "status" | "text" | "cite" | "proposal" | "plan" | "done" | "error"; data: Record<string, unknown> };

const MAX_CITED_TEXT = 800;

/** A search-result citation from the API (a streamed delta or a stored block); anything else is not one of ours. */
export function toCitation(raw: unknown): Citation | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.type !== "search_result_location" || typeof c.source !== "string" || !c.source) return null;
  const cited = typeof c.cited_text === "string" ? c.cited_text : "";
  return { source: c.source, title: typeof c.title === "string" ? c.title : "", cited_text: cited.length > MAX_CITED_TEXT ? `${cited.slice(0, MAX_CITED_TEXT - 1)}…` : cited };
}

/**
 * The answer's text (its text blocks run together, as streamed) with each cited block's citations placed at
 * the end of that block, then trimmed with the offsets moved to match.
 */
export function flattenCited(content: Block[]): { text: string; citations: PlacedCitation[] } {
  let text = "";
  const placed: PlacedCitation[] = [];
  for (const b of content) {
    if (b.type !== "text") continue;
    text += String(b.text);
    const seen = new Set<string>();
    for (const raw of Array.isArray(b.citations) ? b.citations : []) {
      const c = toCitation(raw);
      const key = c && `${c.source}\n${c.cited_text}`;
      if (!c || seen.has(key!)) continue;
      seen.add(key!);
      placed.push({ at: text.length, ...c });
    }
  }
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return { text: trimmed, citations: placed.map((c) => ({ ...c, at: Math.min(Math.max(c.at - lead, 0), trimmed.length) })) };
}

/** Wires a model call's text and citations to SSE events: citations are batched and sent just before the next text (or at the end), so a marker lands right after the text it cites. */
function streamTo(emit: (e: SseEvent) => void, onDelta?: (delta: string) => void) {
  let pending: Citation[] = [];
  const flush = () => {
    if (!pending.length) return;
    emit({ event: "cite", data: { citations: pending } });
    pending = [];
  };
  return {
    onText: (delta: string) => {
      flush();
      onDelta?.(delta);
      emit({ event: "text", data: { delta } });
    },
    onCite: (c: Citation) => void pending.push(c),
    flush,
  };
}

export type ChatDeps = { api: PlannerApi; catalog: Catalog; knowledge: Knowledge; callModel: CallModel };

/** A refusal before the stream starts: the route answers with this status and JSON. */
export class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: "auth" | ErrorRefusal | "busy" | "bad_request" | "server",
  ) {
    super(message);
  }
}

/** Why the planner refuses to start (or go on with) an answer: the player's monthly credit is used up, they hit today's cap, or everyone hit the month's cap. */
export type Refusal = "credit" | "daily" | "monthly";
type ErrorRefusal = Refusal;
const REFUSAL_MESSAGES: Record<Refusal, string> = {
  credit: "You've used this month's free Log Pose credit.",
  daily: "Log Pose has reached today's limit. It resets at midnight UTC.",
  monthly: "Log Pose is resting until the 1st.",
};
/** The 429 for a refusal. */
export const refusalError = (r: Refusal) => new ChatHttpError(429, REFUSAL_MESSAGES[r], r);

const deckContext = z.object({
  name: z.string().max(120).optional(),
  leaderId: z.string().max(20).nullable().optional(),
  cards: z.array(z.object({ id: z.string().max(20), copies: z.number().int().min(1).max(50) })).max(80).optional(),
  /** Which saved deck this is ("planner:<id>" or "duel:<id>"), so a suggested edit can say where it applies. The model never sees it. */
  ref: z.string().regex(/^(planner|duel):[A-Za-z0-9-]{1,64}$/).optional(),
  plannerDeckId: z.number().int().positive().optional(),
});

/** The build hint the player tapped "Why?" on. Limits must equal HINT_LIMITS in packages/analyst-client/src/ask.ts. */
const hintContext = z.object({
  id: z.string().max(80),
  tier: z.enum(["rule", "shape", "synergy"]),
  title: z.string().max(200),
  detail: z.string().max(600),
  cardIds: z.array(z.string().max(20)).max(20).optional(),
});

export const chatBody = z.object({
  thread_id: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(4000),
  context: z
    .object({
      app: z.enum(["duel", "planner"]).optional(),
      page: z.string().max(200).optional(),
      deck: deckContext.optional(),
      hint: hintContext.optional(),
      matchId: z.string().max(80).optional(),
      game: gameContext.optional(),
    })
    .optional(),
});

export const reviewBody = z.object({ match_id: z.string().min(1).max(80), regenerate: z.boolean().optional() });

/** A matchup brief: the ticket the game server signed, and whether to write one when none is saved. */
export const briefBody = z.object({ ticket: z.string().min(10).max(4000), generate: z.boolean() });

export const CHAT_INSTRUCTIONS = `

You're answering in the Log Pose panel inside the player's app, often on a phone. Keep answers short and scannable: a few short paragraphs or a list, markdown allowed, no tables wider than three columns. Look things up with tools rather than asking the player for card text.
A user message can start with a <context> block saying which page they are on and the deck or game open there. Use it when they say "this deck" or "this game"; don't mention the block itself. When the context names a build hint, the player tapped Why? on it: check the deck with analyze_deck, explain what triggers the hint here and whether it matters for this leader, and give +N / -N changes if it does. Hints are the app's rules of thumb, not game rules (except tier rule).
Tool results arrive as sources the app turns into numbered citations for the player. Ground every factual claim (card text and stats, rules, rulings, win rates, playbook notes, what happened in a game, deck numbers, odds) in a tool result and say it in a sentence you can cite, rather than blending several sources into one sentence. Keep your own judgement (matchup reads, what to cut, how a line plays out) in separate sentences and say it is your judgement or your read; judgement is not cited. Don't write source ids or citation numbers yourself.
When the <context> block lists an open deck and you recommend concrete card changes, call propose_deck_edit once with every change and a short reason for each. The app shows them as a card the player can apply. Don't repeat the changes as +N / -N lines; point to the card. If the tool refuses, fix the change and call it again, or explain why. With no open deck, write +N / -N lines. Never say a change was made: only the player applies it.`;

const REVIEW_INSTRUCTIONS = `

You're writing the post-game analysis shown when the player opens one of their games in match history. You get the game turn by turn from their seat. Write it like a coach, in markdown, at most about 350 words:
1. One line: who won, how, and on which turn the game was decided.
2. Key turns: two to four turns that mattered, what happened, and the better line when there was one.
3. What the opponent's deck showed: the cards and plan you saw.
4. One or two concrete things to do differently next time.
Each turn lists the player's hand after the draw and, because the game is over, the opponent's hand (revealed only after the game). Use them to judge which counters were held, missed lines and what the opponent could have done. Judge the player's decisions by what they could know at the time: they didn't see the opponent's hand during the game. Use only cards named in the log.
Each turn of the game is a source the app turns into numbered citations. Ground what happened in the turns (state it in sentences you can cite, one turn's events at a time) and mark your own advice and reads as your judgement. Don't write source ids or citation numbers yourself.`;

export const BRIEF_INSTRUCTIONS = `

You're writing the matchup brief shown on the player's board just before a casual or practice game. They read it on a phone in under a minute, before deciding their mulligan.
You get their leader and full deck and the opponent's leader. You never see the opponent's deck list: talk about what that leader usually plays, as your read.
Before writing, call playbook with leader and opponent, matchup_stats with leader and opponent, and tournament_stats for the opponent's leader when you have it. Look up every card you name with get_cards.
Write at most 160 words of markdown with exactly these bold labels, each starting a short paragraph or up to three bullets, and nothing before the first:
**Game plan** **Mulligan** (cards from this deck to keep or ship) **Key turns** **Watch for** (the opponent's threats by card name)
End with one line starting **Numbers**: the optcgduel.app win rate with games and interval (or say too few games), and the tournament line if there is one. No headings, no tables.
Tool results are sources the app turns into citations: state facts in sentences you can cite; mark matchup reads as your judgement. Don't write source ids or citation numbers.`;

/** The shared tools a brief may use. Personal tools are never offered, so a brief can be cached for everyone. */
export const BRIEF_TOOLS = ["playbook", "matchup_stats", "tournament_stats", "get_cards", "analyze_deck", "draw_odds"];
const BRIEF_MAX_ROUNDS = 5;
const BRIEF_MAX_TOKENS = 1500;

/** The cache variant: a new set (or a prompt change, by bumping v1) writes briefs again. */
export function briefVariant(catalog: Catalog): string {
  return `v1:${newestFormat(catalog.cards.keys())}`;
}

const STATUS: Record<string, string> = {
  search_cards: "Searching cards",
  get_cards: "Reading card text",
  analyze_deck: "Analyzing the deck",
  draw_odds: "Working out draw odds",
  simulate: "Running goldfish games",
  export_deck: "Exporting the list",
  rules_lookup: "Checking the rules",
  card_rulings: "Checking rulings",
  ban_list: "Checking the ban list",
  playbook: "Reading the playbook",
  matchup_stats: "Pulling win rates",
  tournament_stats: "Pulling tournament results",
  search_matches: "Searching recorded games",
  replay_match: "Replaying a game",
  list_my_decks: "Reading your decks",
  list_my_matches: "Reading your match history",
  review_match: "Replaying your game",
  draft_lesson: "Saving a lesson draft",
  my_lessons: "Reading your lessons",
  propose_deck_edit: "Checking the suggested change",
  propose_turn_plan: "Checking the turn plan",
};

export function contextBlock(ctx: z.infer<typeof chatBody>["context"]): string | null {
  if (!ctx) return null;
  const lines: string[] = [];
  if (ctx.app) lines.push(`app: ${ctx.app === "duel" ? "duel app" : "deck planner"}`);
  if (ctx.page) lines.push(`page: ${ctx.page}`);
  if (ctx.deck) {
    const d = ctx.deck;
    const list = [...(d.leaderId ? [`1x${d.leaderId}`] : []), ...(d.cards ?? []).map((c) => `${c.copies}x${c.id}`)];
    lines.push(`open deck: ${d.name ?? "(unnamed)"}${list.length ? `\n${list.join("\n")}` : ""}`);
  }
  if (ctx.deck?.plannerDeckId) lines.push(`planner deck id: ${ctx.deck.plannerDeckId}`);
  if (ctx.hint) {
    const h = ctx.hint;
    lines.push(`build hint (${h.tier}, id ${h.id}): ${h.title}`, `hint detail: ${h.detail}`);
    if (h.cardIds?.length) lines.push(`hint cards: ${h.cardIds.join(", ")}`);
  }
  if (ctx.matchId) lines.push(`open game: match_id ${ctx.matchId}`);
  return lines.length ? `<context>\n${lines.join("\n")}\n</context>` : null;
}

export function apiTools(tools: ToolDef[]) {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(z.object(t.inputSchema)) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: schema };
  });
}

/** Earlier assistant turns without their thinking blocks: a signature is bound to the system prompt and tools it was made under, which can differ now (#424). */
function withoutOldThinking(history: Message[]): Message[] {
  return history.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
    const kept = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
    return kept.length && kept.length < m.content.length ? { ...m, content: kept } : m;
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

async function runTool(tools: ToolDef[], block: Block, onProposal?: (p: DeckEditProposal) => void, onPlan?: (p: TurnPlan) => void): Promise<Block> {
  const tool = tools.find((t) => t.name === block.name);
  const base = { type: "tool_result", tool_use_id: block.id };
  if (!tool) return { ...base, is_error: true, content: `Unknown tool ${String(block.name)}` };
  const parsed = z.object(tool.inputSchema).safeParse(block.input ?? {});
  if (!parsed.success) return { ...base, is_error: true, content: `Invalid input: ${parsed.error.message}` };
  try {
    const result = await tool.run(parsed.data as Record<string, unknown>);
    const text = result.content.map((c) => c.text).join("\n");
    if (tool.name === PROPOSE_TOOL && !result.isError && onProposal) onProposal({ id: String(block.id), ...(JSON.parse(text) as Omit<DeckEditProposal, "id">) });
    if (tool.name === PLAN_TOOL && !result.isError && onPlan) onPlan({ id: String(block.id), ...(JSON.parse(text) as Omit<TurnPlan, "id">) });
    // Facts become search results the model can cite; anything we can't adapt goes back as plain text.
    const sources = result.isError ? null : adaptToolResult(tool.name, text);
    return { ...base, ...(result.isError ? { is_error: true } : {}), content: sources ?? text };
  } catch (err) {
    return { ...base, is_error: true, content: err instanceof Error ? err.message : String(err) };
  }
}

type Budget = {
  allowed: boolean;
  spent_today_usd: number;
  daily_cap_usd: number;
  model?: string;
  /** The limit that stops this player, when one does. */
  refusal?: Refusal | null;
  /** This month's credit (null for an owner), what the player has used of it, and when it refills. */
  credit_usd?: number | null;
  credit_spent_usd?: number;
  credit_resets_at?: string;
};

type Kind = "chat" | "review" | "brief";

/** The model a budget answer names, if it is one we offer; else the env/default CHAT_MODEL. */
export const modelOf = (budget: { model?: unknown }): string => (typeof budget.model === "string" && CHAT_MODELS.includes(budget.model) ? budget.model : CHAT_MODEL);

/** The model Log Pose runs on right now (the planner holds the one setting both apps share). A failed lookup means CHAT_MODEL. */
async function currentModel(api: PlannerApi, token: string): Promise<string> {
  try {
    return modelOf(await plannerCall<Budget>(api, token, "/analyst/chat/budget", true));
  } catch {
    return CHAT_MODEL;
  }
}

/** Checks the chat token only; throws ChatHttpError before anything is streamed. */
export async function admitToken(api: PlannerApi, token: string | null): Promise<string> {
  if (!token?.startsWith("chat.")) throw new ChatHttpError(401, "Sign in again to use Log Pose.", "auth");
  let valid: boolean;
  try {
    valid = await tokenIsValid(api, token);
  } catch {
    throw new ChatHttpError(503, "Couldn't reach the deck planner. Try again shortly.", "server");
  }
  if (!valid) throw new ChatHttpError(401, "Your Log Pose session expired.", "auth");
  return token;
}

/** Throws the 429 ChatHttpError when the player's credit, today's cap or everyone's monthly cap stops them. A refusal is logged as a $0 usage row. */
export async function checkBudget(api: PlannerApi, token: string, kind: Kind = "chat"): Promise<string> {
  const budget = await plannerCall<Budget>(api, token, "/analyst/chat/budget", true);
  const refusal = budget.refusal ?? (budget.allowed ? null : "daily");
  if (refusal) {
    await recordRefusal(api, token, kind, refusal);
    throw refusalError(refusal);
  }
  return modelOf(budget);
}

/** Checks the chat token and the limits; throws ChatHttpError before anything is streamed. */
export async function admit(api: PlannerApi, token: string | null, kind: Kind = "chat"): Promise<string> {
  const ok = await admitToken(api, token);
  await checkBudget(api, ok, kind);
  return ok;
}

/** How a request went, for the usage log. */
type UsageMeta = { threadId?: number; outcome?: "ok" | "error" | "aborted"; toolCalls?: number; durationMs?: number };

async function recordUsage(api: PlannerApi, token: string, kind: Kind, usage: Usage, cost: number, model: string = CHAT_MODEL, meta: UsageMeta = {}) {
  await plannerCall(api, token, "/analyst/chat/usage", true, {
    kind,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: cost,
    ...(meta.threadId ? { thread_id: meta.threadId } : {}),
    outcome: meta.outcome ?? "ok",
    tool_calls: meta.toolCalls ?? 0,
    duration_ms: Math.max(0, Math.round(meta.durationMs ?? 0)),
  });
}

/** A request turned away: a $0 row saying why, so "who ran out and when" is a query. Never blocks the refusal itself. */
async function recordRefusal(api: PlannerApi, token: string, kind: Kind, refusal: Refusal | "busy", threadId?: number) {
  await plannerCall(api, token, "/analyst/chat/usage", true, {
    kind,
    cost_usd: 0,
    outcome: "refused",
    refusal,
    ...(threadId ? { thread_id: threadId } : {}),
  }).catch(() => undefined);
}

/** The limit that stops the player now, counting `extra` dollars an unsaved answer has cost so far; null when none (or the planner can't say). */
async function refusalNow(api: PlannerApi, token: string, extra: number): Promise<Refusal | null> {
  try {
    const budget = await plannerCall<Budget>(api, token, `/analyst/chat/budget?extra=${extra.toFixed(6)}`, true);
    return budget.refusal ?? null;
  } catch {
    return null;
  }
}

/** Streams running per user. Two are allowed (a review beside the chat panel, or a new review as an aborted one winds down); more would let parallel requests all pass the spend-cap check. */
const MAX_STREAMS_PER_USER = 2;
const streaming = new Map<string, number>();

/** Claims one of the user's streams (the token's user id; admit has checked its signature). Returns the release. */
async function claimStream(api: PlannerApi, token: string, kind: Kind): Promise<() => void> {
  const user = token.split(".")[1] ?? token;
  const running = streaming.get(user) ?? 0;
  if (running >= MAX_STREAMS_PER_USER) {
    await recordRefusal(api, token, kind, "busy");
    throw new ChatHttpError(429, "Log Pose is still answering your other questions. Wait for one to finish.", "busy");
  }
  streaming.set(user, running + 1);
  return () => {
    const left = (streaming.get(user) ?? 1) - 1;
    if (left > 0) streaming.set(user, left);
    else streaming.delete(user);
  };
}

/** The usage a failed model call had already been billed, which the error carries. */
const partialUsageOf = (err: unknown): Usage => (err as { partialUsage?: Usage } | null)?.partialUsage ?? { input_tokens: 0, output_tokens: 0 };

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
const newRounds = (...turn: Message[]): RoundsState => ({ turn, usage: { input_tokens: 0, output_tokens: 0 }, cost: 0, finished: false, toolCalls: 0 });

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
  /** Called with each deck edit the model proposes (chat only). */
  onProposal?: (p: DeckEditProposal) => void;
  /** Called with each turn plan the model proposes (Log Pose copilot). */
  onPlan?: (p: TurnPlan) => void;
  /** Asked before every round after the first with what the answer has cost so far: a limit it returns stops the loop there. */
  recheck?: (cost: number) => Promise<Refusal | null>;
};

/**
 * The model's tool loop: call the model, run the tools it asks for, repeat until it answers or `maxRounds` run out.
 * Text and citations stream out as they arrive; the messages, the spend and whether it finished go on `state`.
 */
async function runToolRounds(state: RoundsState, o: RoundsOptions): Promise<RoundsState> {
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
      state.finished = true;
      break;
    }
    state.toolCalls += calls.length;
    for (const name of new Set(calls.map((c) => String(c.name)))) o.emit({ event: "status", data: { text: STATUS[name] ?? "Working" } });
    state.turn.push({ role: "user", content: await Promise.all(calls.map((c) => runTool(o.tools, c, o.onProposal, o.onPlan))) });
  }
  return state;
}

/** The turn's user message and the text answered so far as one assistant message (tool calls dropped), or null when nothing was said. */
export function answeredSoFar(turn: Message[]): Message[] | null {
  const text = turn
    .filter((m) => m.role === "assistant" && Array.isArray(m.content))
    .map((m) => (m.content as Block[]).filter((b) => b.type === "text").map((b) => String(b.text)).join(""))
    .filter((t) => t.trim())
    .join("\n\n");
  return text ? [turn[0]!, { role: "assistant", content: [{ type: "text", text }] }] : null;
}

/** One chat turn: the player's message, as many tool rounds as the model needs, the answer streamed. */
export async function runChat(deps: ChatDeps, token: string, body: z.infer<typeof chatBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const release = await claimStream(deps.api, token, "chat");
  try {
    await chatTurn(deps, token, body, emit, signal);
  } finally {
    release();
  }
}

async function chatTurn(deps: ChatDeps, token: string, body: z.infer<typeof chatBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  // A live game is verified first, so a ranked or forged ticket costs nothing: no thread, no model call.
  const game = body.context?.game;
  const claims = game ? await verifyGame(api, token, deps.catalog, game) : null;
  let threadId = body.thread_id;
  let history: Message[] = [];
  if (threadId) {
    try {
      history = withoutOldThinking((await plannerCall<{ messages: Message[] }>(api, token, `/analyst/chat/threads/${threadId}/content`, true)).messages);
    } catch (err) {
      if (err instanceof PlannerApiError && err.status === 404) throw new ChatHttpError(404, "That conversation is gone.", "bad_request");
      throw err;
    }
  } else {
    const title = body.message.replace(/\s+/g, " ").slice(0, 80);
    threadId = (await plannerCall<{ id: number }>(api, token, "/analyst/chat/threads", true, { title })).id;
  }
  const model = await currentModel(api, token);
  emit({ event: "thread", data: { thread_id: threadId } });

  const ctx = contextBlock(body.context);
  const userMessage: Message = {
    role: "user",
    content: [...(ctx ? [{ type: "text", text: ctx }] : []), ...(game && claims ? [{ type: "text", text: gameContextBlock(deps.catalog, game, claims) }] : []), { type: "text", text: body.message }],
  };
  const proposals: DeckEditProposal[] = [];
  // Always registered, so a propose_deck_edit tool_use kept in the history still matches a tool.
  const tools = [...buildTools(deps.catalog, undefined, { api, token }, deps.knowledge), deckEditTool(deps.catalog, deps.knowledge, body.context?.deck), turnPlanTool(deps.catalog, game)];
  const onProposal = (p: DeckEditProposal) => {
    proposals.push(p);
    emit({ event: "proposal", data: p });
  };
  const onPlan = (p: TurnPlan) => emit({ event: "plan", data: p });
  // The copilot text is a second block after the cached prefix, so turns without a game keep the same cached prefix.
  const system = [
    { type: "text", text: instructionsFor(true) + CHAT_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
    ...(game ? [{ type: "text", text: COPILOT_INSTRUCTIONS }] : []),
  ];
  const state = newRounds(userMessage);
  const turn = state.turn;
  const started = Date.now();
  let failed = false;
  try {
    await runToolRounds(state, {
      deps, model, system, tools, history, emit, signal, maxRounds: MAX_TOOL_ROUNDS, maxTokens: 8000, effort: "medium", onProposal, onPlan,
      recheck: (cost) => refusalNow(api, token, cost),
    });
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    const { usage, finished } = state;
    const cost = state.cost;
    const outcome = finished || state.refusal ? "ok" : failed && signal.aborted ? "aborted" : "error";
    if (usage.input_tokens || usage.output_tokens) {
      await recordUsage(api, token, "chat", usage, cost, state.model ?? model, { threadId, outcome, toolCalls: state.toolCalls, durationMs: Date.now() - started }).catch(() => undefined);
    }
    if (state.refusal) await recordRefusal(api, token, "chat", state.refusal, threadId);
    // A turn is stored only once the model has answered, so the thread always ends on an assistant message.
    // A turn a limit cut short keeps what was already answered, as plain text.
    const kept = finished ? turn : state.refusal ? answeredSoFar(turn) : null;
    if (kept) {
      await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`, true, { messages: kept });
      // Kept next to the thread so the card comes back after a reload. A failure here must never lose the turn.
      if (finished && proposals.length) {
        await plannerCall(api, token, `/analyst/chat/threads/${threadId}/proposals`, true, { proposals }).catch((err) =>
          console.error("saving deck edit proposals failed", err instanceof Error ? err.message : err),
        );
      }
    }
  }
  if (state.refusal) throw refusalError(state.refusal);
  if (!state.finished) throw new Error("Log Pose used too many lookups on that one. Try asking something narrower.");
  const budget = await plannerCall<Budget>(api, token, "/analyst/chat/budget", true);
  emit({
    event: "done",
    data: {
      thread_id: threadId,
      cost_usd: state.cost,
      spent_today_usd: budget.spent_today_usd,
      daily_cap_usd: budget.daily_cap_usd,
      credit_usd: budget.credit_usd ?? null,
      credit_spent_usd: budget.credit_spent_usd ?? 0,
      refusal: budget.refusal ?? null,
    },
  });
}

/** The post-game analysis of one of the player's games: one model call over the game from their seat, saved for next time. */
export async function runReview(deps: ChatDeps, token: string, body: z.infer<typeof reviewBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const release = await claimStream(deps.api, token, "review");
  try {
    await reviewTurn(deps, token, body, emit, signal);
  } finally {
    release();
  }
}

async function reviewTurn(deps: ChatDeps, token: string, body: z.infer<typeof reviewBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  let game: Awaited<ReturnType<typeof reviewMatch>>;
  try {
    game = await reviewMatch(api, token, body.match_id, { maxLines: 700 });
  } catch (err) {
    if (err instanceof PlannerApiError && err.status === 404) throw new ChatHttpError(404, "No replay was kept for this game.", "bad_request");
    throw err;
  }
  emit({ event: "status", data: { text: "Reading the game" } });
  const model = await currentModel(api, token);
  const started = Date.now();
  let text = "";
  const out = streamTo(emit, (delta) => {
    text += delta;
  });
  let reply: ModelReply;
  try {
    reply = await deps.callModel(
      {
        model,
        max_tokens: 6000,
        system: [{ type: "text", text: instructionsFor(true) + REVIEW_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
        // One source per turn, so the review can cite the turns it talks about.
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Here is the game, from my seat: an overview, then each turn as its own source." },
              ...gameResults("match", game.matchId, game),
              { type: "text", text: [...game.notes, "Write the post-game analysis."].join(" ") },
            ],
          },
        ],
        ...outputConfigFor(model, "high"),
      },
      out.onText,
      signal,
      out.onCite,
    );
  } catch (err) {
    const partial = partialUsageOf(err);
    if (partial.input_tokens || partial.output_tokens) {
      await recordUsage(api, token, "review", partial, costUsd(partial, model), model, { outcome: signal.aborted ? "aborted" : "error", durationMs: Date.now() - started }).catch(() => undefined);
    }
    throw err;
  }
  out.flush();
  const cost = costUsd(reply.usage, reply.model ?? model);
  await recordUsage(api, token, "review", reply.usage, cost, reply.model ?? model, { durationMs: Date.now() - started }).catch(() => undefined);
  const cited = flattenCited(reply.content);
  const final = cited.text || text.trim();
  if (!final) throw new Error("Log Pose didn't write anything for this game. Try again.");
  const citations = cited.text ? cited.citations : [];
  await plannerCall(api, token, `/analyst/reviews/${encodeURIComponent(body.match_id)}`, true, { text: final, citations }, "PUT");
  emit({ event: "done", data: { cost_usd: cost, saved: true } });
}

/** Replays a saved answer as the stream would have sent it: text up to each citation's offset, then that offset's citations. */
export function replayCited(text: string, citations: PlacedCitation[], emit: (e: SseEvent) => void) {
  const offsets = [...new Set(citations.map((c) => Math.min(c.at, text.length)))].sort((a, b) => a - b);
  let sent = 0;
  for (const at of offsets) {
    if (at > sent) emit({ event: "text", data: { delta: text.slice(sent, at) } });
    sent = Math.max(sent, at);
    const group = citations.filter((c) => Math.min(c.at, text.length) === at).map(({ at: _at, ...c }) => c);
    emit({ event: "cite", data: { citations: group } });
  }
  if (sent < text.length) emit({ event: "text", data: { delta: text.slice(sent) } });
}

type BriefLookup = {
  leader_id: string;
  opponent_id: string;
  deck: { id: string; copies: number }[];
  key: string;
  brief: { text: string; citations: PlacedCitation[]; created_at: string | null } | null;
};

const nameOf = (catalog: Catalog, id: string) => catalog.cards.get(id)?.name ?? "unknown card";

/**
 * The matchup brief for a casual or practice game. The planner checks the game server's ticket (a ranked or
 * forged one is refused before any model call) and holds the saved brief; a saved one is replayed for free,
 * and a new one is written only when the player asked for it and has budget left.
 */
export async function runBrief(deps: ChatDeps, token: string, body: z.infer<typeof briefBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  const variant = briefVariant(deps.catalog);
  let found: BriefLookup;
  try {
    found = await plannerCall<BriefLookup>(api, token, "/analyst/briefs/lookup", true, { ticket: body.ticket, variant });
  } catch (err) {
    if (err instanceof PlannerApiError && (err.status === 403 || err.status === 400 || err.status === 422)) {
      throw new ChatHttpError(400, "Matchup briefs are only for casual and practice games.", "bad_request");
    }
    throw err;
  }
  if (found.brief) {
    replayCited(found.brief.text, found.brief.citations, emit);
    emit({ event: "done", data: { cached: true, cost_usd: 0 } });
    return;
  }
  if (!body.generate) {
    emit({ event: "done", data: { cached: false } });
    return;
  }
  // Generating is a stream like a chat or review: claimed before the budget check, so parallel briefs can't all pass it.
  const release = await claimStream(api, token, "brief");
  try {
    let model: string;
    try {
      model = await checkBudget(api, token, "brief");
    } catch (err) {
      // Out of credit: the board just shows no brief, and no error.
      if (err instanceof ChatHttpError && err.code === "credit") {
        emit({ event: "done", data: { cached: false, refused: "credit" } });
        return;
      }
      throw err;
    }

    const tools = buildTools(deps.catalog, undefined, undefined, deps.knowledge).filter((t) => BRIEF_TOOLS.includes(t.name));
    const deckLines = found.deck.map((c) => `${c.copies}x${c.id}`);
    const prompt = [
      `Leader: ${found.leader_id} (${nameOf(deps.catalog, found.leader_id)})`,
      `Opponent's leader: ${found.opponent_id} (${nameOf(deps.catalog, found.opponent_id)})`,
      "My deck:",
      `1x${found.leader_id}`,
      ...deckLines,
      "",
      "Write the matchup brief.",
    ].join("\n");
    const system = [{ type: "text", text: instructionsFor(false) + BRIEF_INSTRUCTIONS, cache_control: { type: "ephemeral" } }];
    const state = newRounds({ role: "user", content: [{ type: "text", text: prompt }] });
    const started = Date.now();
    let failed = false;
    try {
      await runToolRounds(state, { deps, model, system, tools, emit, signal, maxRounds: BRIEF_MAX_ROUNDS, maxTokens: BRIEF_MAX_TOKENS, effort: "low", recheck: (cost) => refusalNow(api, token, cost) });
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const outcome = state.finished || state.refusal ? "ok" : failed && signal.aborted ? "aborted" : "error";
      if (state.usage.input_tokens || state.usage.output_tokens) {
        await recordUsage(api, token, "brief", state.usage, state.cost, state.model ?? model, { outcome, toolCalls: state.toolCalls, durationMs: Date.now() - started }).catch(() => undefined);
      }
    }
    if (state.refusal) {
      // The credit ran out while writing: nothing is saved or shown, and no error.
      await recordRefusal(api, token, "brief", state.refusal);
      emit({ event: "done", data: { cached: false, refused: state.refusal } });
      return;
    }
    if (!state.finished) throw new Error("Log Pose used too many lookups on that one. Try again.");
    // The saved text is what was streamed: the rounds' text blocks, kept apart by a blank line.
    const blocks: Block[] = [];
    for (const m of state.turn) {
      if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
      const text = m.content.filter((b) => b.type === "text");
      if (!text.length) continue;
      if (blocks.length) blocks.push({ type: "text", text: "\n\n" });
      blocks.push(...text);
    }
    const cited = flattenCited(blocks);
    if (!cited.text) throw new Error("Log Pose didn't write a brief. Try again.");
    await plannerCall(api, token, "/analyst/briefs", true, { ticket: body.ticket, variant, text: cited.text, citations: cited.citations }, "PUT");
    emit({ event: "done", data: { cached: false, cost_usd: state.cost, saved: true } });
  } finally {
    release();
  }
}

/** The Claude API behind CallModel: a streamed Messages call. */
export function anthropicModel(client: { beta: { messages: { stream: (p: never, o: { signal: AbortSignal }) => StreamLike } } }): CallModel {
  return async (params, onText, signal, onCite) => {
    const stream = client.beta.messages.stream(params as never, { signal });
    stream.on("text", onText);
    stream.on("citation", (citation) => {
      const c = toCitation(citation);
      if (c) onCite?.(c);
    });
    // What the stream has used so far, kept as it arrives: a stream that fails or is aborted never reaches finalMessage's usage.
    let used: Usage = { input_tokens: 0, output_tokens: 0 };
    stream.on("streamEvent", (_event, snapshot) => {
      used = { ...snapshot.usage };
    });
    let msg: Awaited<ReturnType<StreamLike["finalMessage"]>>;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { partialUsage: used });
    }
    return { content: msg.content as unknown as Block[], stop_reason: msg.stop_reason, usage: msg.usage, model: msg.model };
  };
}

type StreamLike = {
  on: ((event: "text", cb: (delta: string) => void) => unknown) &
    ((event: "citation", cb: (citation: unknown) => void) => unknown) &
    ((event: "streamEvent", cb: (event: unknown, snapshot: { usage: Usage }) => void) => unknown);
  finalMessage: () => Promise<{ content: unknown; stop_reason: string | null; usage: Usage; model?: string }>;
};

/** Browsers may call /chat from the two apps, their Vercel previews and local dev. Auth is the bearer token, not cookies. */
export function originAllowed(allowed: string[], origin: string | undefined): boolean {
  if (!origin) return false;
  return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}
