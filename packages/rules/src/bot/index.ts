/**
 * Bots (#631): pick one legal intent for a seat. Easy and normal decide from the seat's own PlayerView alone, so they
 * never see hidden information. Hard also searches ahead, but only on determinized copies of the match (see
 * determinize.ts) in which everything the seat cannot see has been resampled.
 *
 * Every answer is one of `view.legalIntents`, except answers to a pending choice, which the bot builds itself
 * (the engine lists only its default answer for those) and keeps inside the request's limits. A caller that
 * gets such an answer rejected should fall back to the engine default (`getPlayerView(...).legalIntents[0]`).
 */
import { getPlayerView } from "../engine.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { createSeededRng } from "../rng.js";
import { chooseBotIntent } from "./policy.js";
import { chooseHardIntent } from "./search.js";
import type { BotOptions } from "./types.js";

export { BOT_LEVELS, chooseBotIntent, MAX_INTENTS_PER_TURN } from "./policy.js";
export type { BotLevel, BotOptions, BotView, HardTrace } from "./types.js";
export { actingSeat } from "./acting.js";
export { determinize } from "./determinize.js";
export { evaluate, EVAL_WEIGHTS } from "./evaluate.js";
export { HARD_DEFAULTS } from "./search.js";
export { rankOptions, winProbability, type AnalysisOptions, type PositionOption } from "./analysis.js";

/**
 * The intent the bot sends for `seat` in `state`, or null when it is not that seat's move.
 * Easy and normal use only `getPlayerView(state, seat)`; hard searches determinized copies of `state`.
 */
export function chooseBotIntentFromState(state: MatchState, seat: Seat, opts: BotOptions = {}): Intent | null {
  if (opts.level === "hard") return chooseHardIntent(state, seat, opts);
  return chooseBotIntent(getPlayerView(state, seat), { ...opts, rng: opts.rng ?? createSeededRng(0x0b07) });
}
