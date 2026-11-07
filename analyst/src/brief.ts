import type { z } from "zod";
import { PlannerApiError, plannerCall } from "./matches";
import { newestFormat } from "./playbook";
import { buildTools } from "./server";
import type { Catalog } from "./catalog";
import { checkBudget, claimStream, recordRefusal, recordUsage, refusalNow } from "./budget";
import { flattenCited, replayCited } from "./citations";
import { ChatHttpError, UserFacingError } from "./errors";
import { systemFor } from "./prompts/system";
import type { ToolName } from "./toolMeta";
import { newRounds, runToolRounds } from "./rounds";
import type { briefBody } from "./schemas";
import type { Block, ChatDeps, PlacedCitation, SseEvent } from "./types";

/** The shared tools a brief may use. Personal tools are never offered, so a brief can be cached for everyone. */
export const BRIEF_TOOLS: ToolName[] = ["playbook", "matchup_stats", "tournament_stats", "get_cards", "analyze_deck", "draw_odds"];
const BRIEF_MAX_ROUNDS = 5;
const BRIEF_MAX_TOKENS = 1500;

/** The cache variant: a new set (or a prompt change, by bumping v1) writes briefs again. */
export function briefVariant(catalog: Catalog): string {
  return `v3:${newestFormat(catalog.cards.keys())}`;
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
    const system = systemFor({ kind: "brief" });
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
        await recordUsage(api, token, "brief", state.usage, state.cost, state.model ?? model, { outcome, toolCalls: state.toolCalls, durationMs: Date.now() - started });
      }
    }
    if (state.refusal) {
      // The credit ran out while writing: nothing is saved or shown, and no error.
      await recordRefusal(api, token, "brief", state.refusal);
      emit({ event: "done", data: { cached: false, refused: state.refusal } });
      return;
    }
    if (!state.finished) throw new UserFacingError("Log Pose used too many lookups on that one. Try again.");
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
    if (!cited.text) throw new UserFacingError("Log Pose didn't write a brief. Try again.");
    await plannerCall(api, token, "/analyst/briefs", true, { ticket: body.ticket, variant, text: cited.text, citations: cited.citations }, "PUT");
    emit({ event: "done", data: { cached: false, cost_usd: state.cost, saved: true } });
  } finally {
    release();
  }
}
