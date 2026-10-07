/**
 * Log Pose in the app: the chat panel's /chat turn and the post-game /review-match, run here with the
 * Claude API. The browser holds a short-lived chat token from the planner; threads, spend and reviews
 * are kept by the planner API, and the model sees the same tools as the connector.
 */
import { z } from "zod";
import type { Catalog } from "./catalog";
import { PlannerApiError, plannerCall, reviewMatch, tokenIsValid, type PlannerApi } from "./matches";
import { buildTools, instructionsFor, type Knowledge, type ToolDef } from "./server";
import { adaptToolResult, gameResults } from "./sources";

export const CHAT_MODEL = process.env.ANALYST_CHAT_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 12;

/** Dollars per million tokens for the chat model (input, output, cache reads, cache writes). */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costUsd(u: Usage): number {
  const m = 1_000_000;
  return (
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    m
  );
}

type Block = Record<string, unknown> & { type: string };
export type Message = { role: "user" | "assistant"; content: string | Block[] };
export type ModelReply = { content: Block[]; stop_reason: string | null; usage: Usage };

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

export type SseEvent = { event: "thread" | "status" | "text" | "cite" | "done" | "error"; data: Record<string, unknown> };

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
    readonly code: "auth" | "budget" | "bad_request" | "server",
  ) {
    super(message);
  }
}

const deckContext = z.object({
  name: z.string().max(120).optional(),
  leaderId: z.string().max(20).nullable().optional(),
  cards: z.array(z.object({ id: z.string().max(20), copies: z.number().int().min(1).max(50) })).max(80).optional(),
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
    })
    .optional(),
});

export const reviewBody = z.object({ match_id: z.string().min(1).max(80), regenerate: z.boolean().optional() });

const CHAT_INSTRUCTIONS = `

You're answering in the Log Pose panel inside the player's app, often on a phone. Keep answers short and scannable: a few short paragraphs or a list, markdown allowed, no tables wider than three columns. Look things up with tools rather than asking the player for card text.
A user message can start with a <context> block saying which page they are on and the deck or game open there. Use it when they say "this deck" or "this game"; don't mention the block itself. When the context names a build hint, the player tapped Why? on it: check the deck with analyze_deck, explain what triggers the hint here and whether it matters for this leader, and give +N / -N changes if it does. Hints are the app's rules of thumb, not game rules (except tier rule).
Tool results arrive as sources the app turns into numbered citations for the player. Ground every factual claim (card text and stats, rules, rulings, win rates, playbook notes, what happened in a game, deck numbers, odds) in a tool result and say it in a sentence you can cite, rather than blending several sources into one sentence. Keep your own judgement (matchup reads, what to cut, how a line plays out) in separate sentences and say it is your judgement or your read; judgement is not cited. Don't write source ids or citation numbers yourself.`;

const REVIEW_INSTRUCTIONS = `

You're writing the post-game analysis shown when the player opens one of their games in match history. You get the game turn by turn from their seat. Write it like a coach, in markdown, at most about 350 words:
1. One line: who won, how, and on which turn the game was decided.
2. Key turns: two to four turns that mattered, what happened, and the better line when there was one.
3. What the opponent's deck showed: the cards and plan you saw.
4. One or two concrete things to do differently next time.
You never saw the opponent's hidden cards; don't state guesses about them as fact. Use only cards named in the log.
Each turn of the game is a source the app turns into numbered citations. Ground what happened in the turns (state it in sentences you can cite, one turn's events at a time) and mark your own advice and reads as your judgement. Don't write source ids or citation numbers yourself.`;

const STATUS: Record<string, string> = {
  search_cards: "Searching cards",
  get_cards: "Reading card text",
  analyze_deck: "Analyzing the deck",
  draw_odds: "Working out draw odds",
  export_deck: "Exporting the list",
  rules_lookup: "Checking the rules",
  card_rulings: "Checking rulings",
  ban_list: "Checking the ban list",
  playbook: "Reading the playbook",
  matchup_stats: "Pulling win rates",
  search_matches: "Searching recorded games",
  replay_match: "Replaying a game",
  list_my_decks: "Reading your decks",
  list_my_matches: "Reading your match history",
  review_match: "Replaying your game",
  draft_lesson: "Saving a lesson draft",
  my_lessons: "Reading your lessons",
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

async function runTool(tools: ToolDef[], block: Block): Promise<Block> {
  const tool = tools.find((t) => t.name === block.name);
  const base = { type: "tool_result", tool_use_id: block.id };
  if (!tool) return { ...base, is_error: true, content: `Unknown tool ${String(block.name)}` };
  const parsed = z.object(tool.inputSchema).safeParse(block.input ?? {});
  if (!parsed.success) return { ...base, is_error: true, content: `Invalid input: ${parsed.error.message}` };
  try {
    const result = await tool.run(parsed.data as Record<string, unknown>);
    const text = result.content.map((c) => c.text).join("\n");
    // Facts become search results the model can cite; anything we can't adapt goes back as plain text.
    const sources = result.isError ? null : adaptToolResult(tool.name, text);
    return { ...base, ...(result.isError ? { is_error: true } : {}), content: sources ?? text };
  } catch (err) {
    return { ...base, is_error: true, content: err instanceof Error ? err.message : String(err) };
  }
}

type Budget = { allowed: boolean; spent_today_usd: number; daily_cap_usd: number };

/** Checks the chat token and the spend caps; throws ChatHttpError before anything is streamed. */
export async function admit(api: PlannerApi, token: string | null): Promise<string> {
  if (!token?.startsWith("chat.")) throw new ChatHttpError(401, "Sign in again to use Log Pose.", "auth");
  let valid: boolean;
  try {
    valid = await tokenIsValid(api, token);
  } catch {
    throw new ChatHttpError(503, "Couldn't reach the deck planner. Try again shortly.", "server");
  }
  if (!valid) throw new ChatHttpError(401, "Your Log Pose session expired.", "auth");
  const budget = await plannerCall<Budget>(api, token, "/analyst/chat/budget", true);
  if (!budget.allowed) throw new ChatHttpError(429, "Log Pose has reached today's limit. It resets at midnight UTC.", "budget");
  return token;
}

async function recordUsage(api: PlannerApi, token: string, kind: "chat" | "review", usage: Usage, cost: number) {
  await plannerCall(api, token, "/analyst/chat/usage", true, {
    kind,
    model: CHAT_MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: cost,
  });
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
});

/** One chat turn: the player's message, as many tool rounds as the model needs, the answer streamed. */
export async function runChat(deps: ChatDeps, token: string, body: z.infer<typeof chatBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  let threadId = body.thread_id;
  let history: Message[] = [];
  if (threadId) {
    try {
      history = (await plannerCall<{ messages: Message[] }>(api, token, `/analyst/chat/threads/${threadId}/content`, true)).messages;
    } catch (err) {
      if (err instanceof PlannerApiError && err.status === 404) throw new ChatHttpError(404, "That conversation is gone.", "bad_request");
      throw err;
    }
  } else {
    const title = body.message.replace(/\s+/g, " ").slice(0, 80);
    threadId = (await plannerCall<{ id: number }>(api, token, "/analyst/chat/threads", true, { title })).id;
  }
  emit({ event: "thread", data: { thread_id: threadId } });

  const ctx = contextBlock(body.context);
  const userMessage: Message = {
    role: "user",
    content: [...(ctx ? [{ type: "text", text: ctx }] : []), { type: "text", text: body.message }],
  };
  const turn: Message[] = [userMessage];
  const tools = buildTools(deps.catalog, undefined, { api, token }, deps.knowledge);
  const system = [{ type: "text", text: instructionsFor(true) + CHAT_INSTRUCTIONS, cache_control: { type: "ephemeral" } }];
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let finished = false;
  // Text from separate rounds is kept apart by a blank line, as the stored thread shows it.
  let wroteText = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let breakPending = wroteText;
      const out = streamTo(emit, () => {
        wroteText = true;
      });
      const reply = await deps.callModel(
        {
          model: CHAT_MODEL,
          max_tokens: 8000,
          system,
          tools: apiTools(tools),
          messages: withCacheBreakpoint([...history, ...turn]),
          output_config: { effort: "medium" },
        },
        (delta) => {
          out.onText(breakPending ? `\n\n${delta}` : delta);
          breakPending = false;
        },
        signal,
        out.onCite,
      );
      out.flush();
      usage = addUsage(usage, reply.usage);
      turn.push({ role: "assistant", content: reply.content });
      const calls = reply.content.filter((b) => b.type === "tool_use");
      if (reply.stop_reason !== "tool_use" || calls.length === 0) {
        finished = true;
        break;
      }
      for (const name of new Set(calls.map((c) => String(c.name)))) emit({ event: "status", data: { text: STATUS[name] ?? "Working" } });
      turn.push({ role: "user", content: await Promise.all(calls.map((c) => runTool(tools, c))) });
    }
  } finally {
    const cost = costUsd(usage);
    if (usage.input_tokens || usage.output_tokens) await recordUsage(api, token, "chat", usage, cost).catch(() => undefined);
    // A turn is stored only once the model has answered, so the thread always ends on an assistant message.
    if (finished) await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`, true, { messages: turn });
  }
  if (!finished) throw new Error("Log Pose used too many lookups on that one. Try asking something narrower.");
  const budget = await plannerCall<Budget>(api, token, "/analyst/chat/budget", true);
  emit({
    event: "done",
    data: { thread_id: threadId, cost_usd: costUsd(usage), spent_today_usd: budget.spent_today_usd, daily_cap_usd: budget.daily_cap_usd },
  });
}

/** The post-game analysis of one of the player's games: one model call over the game from their seat, saved for next time. */
export async function runReview(deps: ChatDeps, token: string, body: z.infer<typeof reviewBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  let game: Awaited<ReturnType<typeof reviewMatch>>;
  try {
    game = await reviewMatch(api, token, body.match_id, { maxLines: 700 });
  } catch (err) {
    if (err instanceof PlannerApiError && err.status === 404) throw new ChatHttpError(404, "No replay was kept for this game.", "bad_request");
    throw err;
  }
  emit({ event: "status", data: { text: "Reading the game" } });
  let text = "";
  const out = streamTo(emit, (delta) => {
    text += delta;
  });
  const reply = await deps.callModel(
    {
      model: CHAT_MODEL,
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
      output_config: { effort: "high" },
    },
    out.onText,
    signal,
    out.onCite,
  );
  out.flush();
  const cost = costUsd(reply.usage);
  await recordUsage(api, token, "review", reply.usage, cost).catch(() => undefined);
  const cited = flattenCited(reply.content);
  const final = cited.text || text.trim();
  if (!final) throw new Error("Log Pose didn't write anything for this game. Try again.");
  const citations = cited.text ? cited.citations : [];
  await plannerCall(api, token, `/analyst/reviews/${encodeURIComponent(body.match_id)}`, true, { text: final, citations }, "PUT");
  emit({ event: "done", data: { cost_usd: cost, saved: true } });
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
    const msg = await stream.finalMessage();
    return { content: msg.content as unknown as Block[], stop_reason: msg.stop_reason, usage: msg.usage };
  };
}

type StreamLike = {
  on: ((event: "text", cb: (delta: string) => void) => unknown) & ((event: "citation", cb: (citation: unknown) => void) => unknown);
  finalMessage: () => Promise<{ content: unknown; stop_reason: string | null; usage: Usage }>;
};

/** Browsers may call /chat from the two apps, their Vercel previews and local dev. Auth is the bearer token, not cookies. */
export function originAllowed(allowed: string[], origin: string | undefined): boolean {
  if (!origin) return false;
  return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}
