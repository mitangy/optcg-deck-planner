import type { z } from "zod";
import { PlannerApiError, plannerCall, reviewMatch, type ReviewGame } from "./matches";
import { cardReferenceLine } from "./copilot";
import { gameResults } from "./sources";
import type { Catalog } from "./catalog";
import { claimStream, currentModel, recordUsage } from "./budget";
import { flattenCited, streamTo } from "./citations";
import { ChatHttpError, UserFacingError } from "./errors";
import { costUsd, outputConfigFor } from "./models";
import { systemFor } from "./prompts/system";
import { partialUsageOf } from "./rounds";
import type { reviewBody } from "./schemas";
import type { ChatDeps, ModelReply, SseEvent } from "./types";

/** The post-game analysis of one of the player's games: one model call over the game from their seat, saved for next time. */
export async function runReview(deps: ChatDeps, token: string, body: z.infer<typeof reviewBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const release = await claimStream(deps.api, token, "review");
  try {
    await reviewTurn(deps, token, body, emit, signal);
  } finally {
    release();
  }
}

/** Lines of a game a review reads: whole games, including the board lines each turn adds. */
export const REVIEW_MAX_LINES = 1500;

/** Output cap of a review; thinking tokens count against it, so it must leave room for the text after the model has thought (#831). */
export const REVIEW_MAX_TOKENS = 32000;

/** Every card of the game with its printed stats and text: both decks and leaders (the opponent's only once revealed) and each card seen in the log. */
export function reviewCardReference(catalog: Catalog, game: ReviewGame): string {
  const g = game as { yourLeaderId: string; opponentLeaderId: string; yourDeck: { id: string }[]; opponentDeck?: { id: string }[]; cardsInGame: string[] };
  const ids = new Set<string>([g.yourLeaderId, g.opponentLeaderId, ...g.yourDeck.map((d) => d.id), ...(g.opponentDeck ?? []).map((d) => d.id), ...g.cardsInGame]);
  const lines = [...ids].flatMap((id) => {
    const c = catalog.cards.get(id);
    return c ? [cardReferenceLine(c)] : [];
  });
  return ["Card reference:", ...lines].join("\n");
}

/** The model request for a post-game review. The eval sends this same request, so the prompt it measures is the one players get. */
export function reviewRequest(catalog: Catalog, model: string, game: ReviewGame) {
  return {
    model,
    max_tokens: REVIEW_MAX_TOKENS,
    system: systemFor({ kind: "review" }),
    // One source per turn, so the review can cite the turns it talks about.
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Here is the game, from my seat: an overview, then each turn as its own source." },
          ...gameResults("match", game.matchId, game),
          { type: "text" as const, text: reviewCardReference(catalog, game) },
          { type: "text" as const, text: [...game.notes, "Write the post-game analysis."].join(" ") },
        ],
      },
    ],
    ...outputConfigFor(model, "high"),
  };
}

async function reviewTurn(deps: ChatDeps, token: string, body: z.infer<typeof reviewBody>, emit: (e: SseEvent) => void, signal: AbortSignal) {
  const { api } = deps;
  let game: ReviewGame;
  try {
    game = await reviewMatch(api, token, body.match_id, { maxLines: REVIEW_MAX_LINES });
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
      reviewRequest(deps.catalog, model, game),
      out.onText,
      signal,
      out.onCite,
    );
  } catch (err) {
    const partial = partialUsageOf(err);
    if (partial.input_tokens || partial.output_tokens) {
      await recordUsage(api, token, "review", partial, costUsd(partial, model), model, { outcome: signal.aborted ? "aborted" : "error", durationMs: Date.now() - started });
    }
    throw err;
  }
  out.flush();
  const cost = costUsd(reply.usage, reply.model ?? model);
  await recordUsage(api, token, "review", reply.usage, cost, reply.model ?? model, { durationMs: Date.now() - started });
  const cited = flattenCited(reply.content);
  const final = cited.text || text.trim();
  if (!final) {
    if (reply.stop_reason === "max_tokens") throw new UserFacingError("Log Pose ran out of room before writing this review. Try again.");
    throw new UserFacingError("Log Pose didn't write anything for this game. Try again.");
  }
  const citations = cited.text ? cited.citations : [];
  await plannerCall(api, token, `/analyst/reviews/${encodeURIComponent(body.match_id)}`, true, { text: final, citations }, "PUT");
  emit({ event: "done", data: { cost_usd: cost, saved: true } });
}
