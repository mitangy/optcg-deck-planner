import { HINT_CARD_ID_MAX, HINT_LIMITS, SCOPE_PATTERN, SCOPE_TITLE_MAX } from "@optcg/analyst-contract";
import { z } from "zod";
import { gameContext } from "./copilot";

const deckContext = z.object({
  name: z.string().max(120).optional(),
  leaderId: z.string().max(20).nullable().optional(),
  cards: z.array(z.object({ id: z.string().max(20), copies: z.number().int().min(1).max(50) })).max(80).optional(),
  /** Which saved deck this is ("planner:<id>" or "duel:<id>"), so a suggested edit can say where it applies. The model never sees it. */
  ref: z.string().regex(/^(planner|duel):[A-Za-z0-9-]{1,64}$/).optional(),
  plannerDeckId: z.number().int().positive().optional(),
});

/** The build hint the player tapped "Why?" on. The limits are HINT_LIMITS, which the client cuts a hint to. */
const hintContext = z.object({
  id: z.string().max(HINT_LIMITS.id),
  tier: z.enum(["rule", "shape", "synergy"]),
  title: z.string().max(HINT_LIMITS.title),
  detail: z.string().max(HINT_LIMITS.detail),
  cardIds: z.array(z.string().max(HINT_CARD_ID_MAX)).max(HINT_LIMITS.cards).optional(),
});

export const chatBody = z.object({
  thread_id: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(4000),
  /** What the chat is about (#970); a verified live game overrides it. Only read when a thread is created. */
  scope: z.string().regex(SCOPE_PATTERN).optional(),
  scope_title: z.string().trim().max(SCOPE_TITLE_MAX).optional(),
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
