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
import { createSeededRng, type Rng } from "../rng.js";
import { chooseBotIntent, memoryFor, recordMainPick, seedTurnMemory } from "./policy.js";
import { chooseHardIntent } from "./search.js";
import type { BotOptions } from "./types.js";

export { BOT_LEVELS, chooseBotIntent, MAX_INTENTS_PER_TURN } from "./policy.js";
export type { BotLevel, BotOptions, BotView, HardTrace } from "./types.js";
export { actingSeat } from "./acting.js";
export { buildDeckPrior, determinize, type DeckPrior, type PriorChoice } from "./determinize.js";
export { DEFAULT_DECK_PRIOR, priorFromFile, priorToFile } from "./defaultPrior.js";
export { extractFeatures, FEATURE_NAMES } from "./features.js";
export { evaluateLearned } from "./learnedEval.js";
export { VALUE_WEIGHTS, weightsMatchFeatures } from "./valueModel.js";
export { describeIntent } from "./labels.js";
export { evaluate, EVAL_WEIGHTS } from "./evaluate.js";
export { HARD_DEFAULTS } from "./search.js";
export { ANALYSIS_DEFAULTS, rankOptions, winProbability, type AnalysisOptions, type PositionOption } from "./analysis.js";

/**
 * The intent the bot sends for `seat` in `state`, or null when it is not that seat's move.
 * Easy and normal use only `getPlayerView(state, seat)`; hard searches determinized copies of `state`.
 */
export function chooseBotIntentFromState(state: MatchState, seat: Seat, opts: BotOptions = {}): Intent | null {
  if (opts.level === "hard") return chooseHardIntent(state, seat, opts);
  return chooseBotIntent(getPlayerView(state, seat), { ...opts, rng: opts.rng ?? createSeededRng(0x0b07) });
}

/** What a bot has done in the current turn (intents sent, abilities activated), so a search run elsewhere can continue the same turn (#635). */
export interface BotTurnMemory { count: number; activated: string[] }

const inMainPhase = (view: ReturnType<typeof getPlayerView>): boolean => view.pendingChoices.length === 0 && view.phase === "main";

/** The turn record `rng` holds for `seat` in `state` (a bot that is searched in a worker thread keeps its record on the caller's side). */
export function botTurnMemory(state: MatchState, seat: Seat, rng: Rng): BotTurnMemory {
  const m = memoryFor(rng, getPlayerView(state, seat));
  return { count: m.count, activated: [...m.activated] };
}

/** Give `rng` the turn record `memory` for `seat` in `state`, as if this bot had sent those intents itself. */
export function seedBotTurnMemory(state: MatchState, seat: Seat, rng: Rng, memory: BotTurnMemory): void {
  seedTurnMemory(rng, getPlayerView(state, seat), { count: memory.count, activated: new Set(memory.activated) });
}

/** Record an intent the caller really sent for the bot, as `chooseBotIntentFromState` does itself when it picks in the caller's thread. */
export function noteBotPick(state: MatchState, seat: Seat, rng: Rng, intent: Intent): void {
  const view = getPlayerView(state, seat);
  if (!inMainPhase(view)) return;
  memoryFor(rng, view).count += 1;
  recordMainPick(view, rng, intent);
}
