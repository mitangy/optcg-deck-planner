/**
 * Bots (#631): pick one legal intent from a seat's own PlayerView, so a bot
 * never sees hidden information (opponent hand, deck order). Used by the
 * self-play recorder (src/sim/selfPlay.ts) and by "Play vs Bot" rooms on the game server.
 *
 * Every answer is one of `view.legalIntents`, except answers to a pending choice, which the bot builds itself
 * (the engine lists only its default answer for those) and keeps inside the request's limits. A caller that
 * gets such an answer rejected should fall back to `view.legalIntents[0]`, the engine's default.
 */
import { createSeededRng, type Rng } from "../rng.js";
import type { Intent } from "../types.js";
import { chooseChoiceAnswer } from "./choices.js";
import { chooseDefense } from "./defense.js";
import { chooseEasyMain, chooseNormalMain, MAX_INTENTS_PER_TURN, type TurnMemory } from "./main.js";
import { chooseMulligan } from "./mulligan.js";
import type { BotLevel, BotOptions, BotView } from "./types.js";

export type { BotLevel, BotOptions, BotView } from "./types.js";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal"];

const DEFAULT_SEED = 0x0b07;
/** Per-rng record of the current turn, so a caller that keeps one rng per bot gets the per-turn action cap. */
const memories = new WeakMap<Rng, { turn: string; memory: TurnMemory }>();

function memoryFor(rng: Rng, view: BotView): TurnMemory {
  const turn = `${view.turnNumber}:${view.activeSeat}`;
  const held = memories.get(rng);
  if (held && held.turn === turn) return held.memory;
  const fresh = { turn, memory: { count: 0, activated: new Set<string>() } };
  memories.set(rng, fresh);
  return fresh.memory;
}

/** The intent the bot sends for this view, or null when it is not the bot's move (no legal intents). */
export function chooseBotIntent(view: BotView, opts: BotOptions = {}): Intent | null {
  const legal = view.legalIntents;
  if (!legal.length) return null;
  const level = opts.level ?? "normal";
  const rng = opts.rng ?? createSeededRng(DEFAULT_SEED);

  if (view.pendingChoices.length > 0) return chooseChoiceAnswer(view, level, rng);
  if (view.phase === "mulligan") return chooseMulligan(view, level, rng);
  if (view.phase === "block" || view.phase === "counter") return chooseDefense(view, level, rng);

  const memory = memoryFor(rng, view);
  memory.count += 1;
  const pick = level === "easy" ? chooseEasyMain(view, rng, memory) : chooseNormalMain(view, rng, memory);
  if (pick.type === "activate_ability") memory.activated.add(`${pick.sourceId}:${pick.abilityId}`);
  return pick;
}

export { MAX_INTENTS_PER_TURN };
