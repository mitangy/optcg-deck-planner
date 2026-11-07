import type { z } from "zod";
import { PlannerApiError, plannerCall } from "./matches";
import { buildTools, instructionsFor } from "./server";
import { answerChoiceTool, AUTOPILOT_INSTRUCTIONS, COPILOT_INSTRUCTIONS, NO_PLANS_INSTRUCTIONS, gameContextBlock, turnPlanTool, verifyGame, type ChoiceAnswer, type TurnPlan } from "./copilot";
import { parseEditLines } from "./editLines";
import { newDeckTool, type NewDeckDraft } from "./newDeck";
import { checkTextEdits, deckEditTool, type ContextDeck, type DeckEditProposal } from "./proposals";
import { claimStream, currentModel, recordRefusal, recordUsage, refusalNow, type Budget } from "./budget";
import { ChatHttpError, refusalError } from "./errors";
import { CHAT_INSTRUCTIONS } from "./prompts/chat";
import { MAX_TOOL_ROUNDS, newRounds, runToolRounds } from "./rounds";
import type { chatBody } from "./schemas";
import type { Block, ChatDeps, Message, SseEvent } from "./types";

/** What the model wrote in the turn so far, as text. */
function textWritten(turn: Message[]): string {
  return turn
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .flatMap((b) => (b.type === "text" ? [String(b.text)] : []))
    .join("\n");
}

/**
 * The app check after an answer (#686): with a deck open and no Apply card made, +N / -N lines in the answer are checked
 * like a proposal would be, and the model is asked to send them through propose_deck_edit. Starts with <context>, so the thread hides it.
 */
async function textEditsCheck(deps: ChatDeps, deck: ContextDeck, turn: Message[]): Promise<Message | null> {
  const edits = parseEditLines(textWritten(turn));
  if (!edits.length) return null;
  const { count, problems } = await checkTextEdits(deps.catalog, deps.knowledge.library, deck, edits);
  const verdict = problems.length || count !== 50 ? `leave the deck at ${count} of 50 cards (problems: ${problems.join("; ") || "none"})` : "keep the deck legal";
  const text =
    "<context>\napp check: your answer lists deck changes but made no Apply card. " +
    `As written they ${verdict}. ` +
    "Call propose_deck_edit with exact changes (every card by number, as many copies out as in) so the player gets a card, " +
    "then add at most one short sentence if the changes differ from what you wrote. Don't mention this check.\n</context>";
  return { role: "user", content: [{ type: "text", text }] };
}

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

/** Earlier assistant turns without their thinking blocks: a signature is bound to the system prompt and tools it was made under, which can differ now (#424). */
function withoutOldThinking(history: Message[]): Message[] {
  return history.flatMap((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return [m];
    const kept = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
    // A turn that was only thinking (cut off by max_tokens, say) has nothing left to resend: drop it (#425).
    if (!kept.length) return m.content.length ? [] : [m];
    return [kept.length < m.content.length ? { ...m, content: kept } : m];
  });
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
    const title = body.scope_title || body.message.replace(/\s+/g, " ").slice(0, 80);
    const matchScope = claims && /^[A-Za-z0-9_-]{1,64}$/.test(claims.matchId ?? "") ? `match:${claims.matchId}` : null;
    const scope = matchScope ?? body.scope ?? "general";
    threadId = (await plannerCall<{ id: number }>(api, token, "/analyst/chat/threads", true, { title, scope })).id;
  }
  const model = await currentModel(api, token);
  emit({ event: "thread", data: { thread_id: threadId } });

  const ctx = contextBlock(body.context);
  const userMessage: Message = {
    role: "user",
    content: [...(ctx ? [{ type: "text", text: ctx }] : []), ...(game && claims ? [{ type: "text", text: gameContextBlock(deps.catalog, game, claims) }] : []), { type: "text", text: body.message }],
  };
  const proposals: DeckEditProposal[] = [];
  const drafts: NewDeckDraft[] = [];
  // Always registered, so a propose_deck_edit tool_use kept in the history still matches a tool.
  const tools = [...buildTools(deps.catalog, undefined, { api, token }, deps.knowledge), deckEditTool(deps.catalog, deps.knowledge, body.context?.deck), newDeckTool(deps.catalog, deps.knowledge), turnPlanTool(deps.catalog, game), answerChoiceTool(deps.catalog, game)];
  const onProposal = (p: DeckEditProposal) => {
    proposals.push(p);
    emit({ event: "proposal", data: p });
  };
  const onDraft = (d: NewDeckDraft) => {
    drafts.push(d);
    emit({ event: "deck_draft", data: d });
  };
  const onPlan = (p: TurnPlan) => emit({ event: "plan", data: p });
  const onChoice = (a: ChoiceAnswer) => emit({ event: "choice", data: a });
  // The copilot text is a second block after the cached prefix, so turns without a game keep the same cached prefix.
  const system = [
    { type: "text", text: instructionsFor(true) + CHAT_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
    ...(game ? [{ type: "text", text: game.plans === false ? COPILOT_INSTRUCTIONS + NO_PLANS_INSTRUCTIONS : COPILOT_INSTRUCTIONS + (game.autopilot ? AUTOPILOT_INSTRUCTIONS : "") }] : []),
  ];
  const state = newRounds(userMessage);
  const turn = state.turn;
  const started = Date.now();
  let failed = false;
  let checked = false;
  try {
    await runToolRounds(state, {
      deps, model, system, tools, history, emit, signal, maxRounds: MAX_TOOL_ROUNDS, maxTokens: 8000, effort: "medium", onProposal, onPlan, onDraft, onChoice,
      recheck: (cost) => refusalNow(api, token, cost),
      afterAnswer: async (st) => {
        const deck = body.context?.deck;
        if (checked || proposals.length || !deck?.ref || !deck.leaderId) return null;
        const message = await textEditsCheck(deps, deck, st.turn);
        if (message) checked = true;
        return message;
      },
    });
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    const { usage, finished } = state;
    const cost = state.cost;
    const outcome = finished || state.refusal ? "ok" : failed && signal.aborted ? "aborted" : "error";
    if (usage.input_tokens || usage.output_tokens) {
      await recordUsage(api, token, "chat", usage, cost, state.model ?? model, { threadId, outcome, toolCalls: state.toolCalls, durationMs: Date.now() - started });
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
      if (finished && drafts.length) {
        await plannerCall(api, token, `/analyst/chat/threads/${threadId}/drafts`, true, { drafts }).catch((err) =>
          console.error("saving new deck drafts failed", err instanceof Error ? err.message : err),
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
