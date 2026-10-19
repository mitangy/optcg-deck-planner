/** Card and board valuation shared by the bot's heuristics. Pure; reads only card definitions and the seat's own view. */
import { getCardDef } from "../cards/definitions.js";
import { cardHasUnconditionalKeyword } from "../cards/keywords.js";
import type { Rng } from "../rng.js";
import type { BotView } from "./types.js";

export type BoardCard = BotView["you"]["characters"][number];

/** Rough worth of a card in "cost points": cost, plus power, Blocker and Rush. Unknown or hidden ids are worth 0. */
export function defValue(defId: string | undefined): number {
  if (!defId || defId === "HIDDEN") return 0;
  let def;
  try { def = getCardDef(defId); } catch { return 0; }
  if (def.type === "leader") return 0;
  if (def.type === "event") return def.cost * 0.8 + 1;
  if (def.type === "stage") return def.cost + 1;
  const blocker = cardHasUnconditionalKeyword(def.id, "blocker") ? 2 : 0;
  const rush = cardHasUnconditionalKeyword(def.id, "rush") ? 1 : 0;
  return def.cost + (def.power ?? 0) / 2000 + blocker + rush + (def.hasTrigger ? 0.3 : 0);
}

/** A card on the field: its definition value, bumped by live power (buffs, attached DON!!). */
export function boardValue(card: BoardCard): number {
  return defValue(card.defId) + Math.max(0, card.power - (card.printedPower ?? card.power)) / 2000;
}

export function isBlocker(card: BoardCard): boolean {
  return card.keywords.includes("blocker");
}

export function findBoardCard(view: BotView, id: string): { card: BoardCard; mine: boolean } | null {
  for (const c of [view.you.leader, ...view.you.characters]) if (c.id === id) return { card: c, mine: true };
  for (const c of [view.opponent.leader, ...view.opponent.characters]) if (c.id === id) return { card: c, mine: false };
  return null;
}

/** Picks among the items whose score is within `eps` of the best, using the rng only to break ties. */
export function pickBest<T>(items: readonly T[], score: (t: T) => number, rng: Rng, eps = 1e-9): T | undefined {
  if (!items.length) return undefined;
  let best = -Infinity;
  for (const it of items) best = Math.max(best, score(it));
  const top = items.filter((it) => score(it) >= best - eps);
  return top[top.length === 1 ? 0 : rng.nextInt(top.length)];
}
