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

/** The build hint the player tapped "Why?" on. Limits must equal HINT_LIMITS in packages/analyst-client/src/ask.ts. */
const hintContext = z.object({
  id: z.string().max(80),
  tier: z.enum(["rule", "shape", "synergy"]),
  title: z.string().max(200),
  detail: z.string().max(600),
  cardIds: z.array(z.string().max(20)).max(20).optional(),
});

/** general | match:<id> | deck:planner:<digits> | deck:duel:<id> (same as the planner's ANALYST_SCOPE_PATTERN). */
const SCOPE_PATTERN = /^(general|match:[A-Za-z0-9_-]{1,64}|deck:planner:[0-9]{1,12}|deck:duel:[A-Za-z0-9_-]{1,64})$/;

export const chatBody = z.object({
  thread_id: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(4000),
  /** What the chat is about (#970); a verified live game overrides it. Only read when a thread is created. */
  scope: z.string().regex(SCOPE_PATTERN).optional(),
  scope_title: z.string().trim().max(80).optional(),
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
