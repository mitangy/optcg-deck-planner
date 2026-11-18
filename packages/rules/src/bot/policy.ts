import { createSeededRng, type Rng } from "../rng.js";
import type { Intent } from "../types.js";
import { chooseChoiceAnswer } from "./choices.js";
import { chooseDefense } from "./defense.js";
import { chooseEasyMain, chooseNormalMain, MAX_INTENTS_PER_TURN, type TurnMemory } from "./main.js";
import { chooseMulligan } from "./mulligan.js";
import { playbookFor, type PlaybookSetting } from "./playbooks/index.js";
import type { BotLevel, BotOptions, BotView } from "./types.js";

export type { BotLevel, BotOptions, BotView } from "./types.js";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal", "hard"];

const DEFAULT_SEED = 0x0b07;
const memories = new WeakMap<Rng, { turn: string; memory: TurnMemory }>();

export function memoryFor(rng: Rng, view: BotView): TurnMemory {
  const turn = `${view.turnNumber}:${view.activeSeat}`;
  const held = memories.get(rng);
  if (held && held.turn === turn) return held.memory;
  const fresh = { turn, memory: { count: 0, activated: new Set<string>() } };
  memories.set(rng, fresh);
  return fresh.memory;
}

export function recordMainPick(view: BotView, rng: Rng, pick: Intent): void {
  if (pick.type === "activate_ability") memoryFor(rng, view).activated.add(`${pick.sourceId}:${pick.abilityId}`);
}

export function seedTurnMemory(rng: Rng, view: BotView, from: TurnMemory): void {
  memories.set(rng, { turn: `${view.turnNumber}:${view.activeSeat}`, memory: { count: from.count, activated: new Set(from.activated) } });
}

function decide(view: BotView, level: "easy" | "normal", rng: Rng, memory: TurnMemory | null, playbooks: PlaybookSetting = true): Intent {
  const pb = level === "easy" ? undefined : playbookFor(view, playbooks);
  if (view.pendingChoices.length > 0) return chooseChoiceAnswer(view, level, rng, pb);
  if (view.phase === "mulligan") return chooseMulligan(view, level, rng, pb);
  if (view.phase === "block" || view.phase === "counter") return chooseDefense(view, level, rng, pb);
  const m = memory ?? memoryFor(rng, view);
  return level === "easy" ? chooseEasyMain(view, rng, m) : chooseNormalMain(view, rng, m, pb);
}

export function peekNormalIntent(view: BotView, rng: Rng, playbooks: PlaybookSetting = true): Intent | null {
  if (!view.legalIntents.length) return null;
  const held = memoryFor(rng, view);
  return decide(view, "normal", rng, { count: held.count + 1, activated: new Set(held.activated) }, playbooks);
}

/** A view alone cannot be searched, so level "hard" plays as "normal" here. */
export function chooseBotIntent(view: BotView, opts: BotOptions = {}): Intent | null {
  const legal = view.legalIntents;
  if (!legal.length) return null;
  const level = opts.level === "easy" ? "easy" : "normal";
  const rng = opts.rng ?? createSeededRng(DEFAULT_SEED);
  const inMain = view.pendingChoices.length === 0 && view.phase !== "mulligan" && view.phase !== "block" && view.phase !== "counter";
  if (!inMain) return decide(view, level, rng, null, opts.playbooks);
  const memory = memoryFor(rng, view);
  memory.count += 1;
  const pick = decide(view, level, rng, memory, opts.playbooks);
  if (pick.type === "activate_ability") memory.activated.add(`${pick.sourceId}:${pick.abilityId}`);
  return pick;
}

export { MAX_INTENTS_PER_TURN };
