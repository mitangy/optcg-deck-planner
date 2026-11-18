import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import { cardHasUnconditionalKeyword } from "../cards/keywords.js";
import type { Rng } from "../rng.js";
import type { BotView } from "./types.js";

export type BoardCard = BotView["you"]["characters"][number];

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

export function boardValue(card: BoardCard): number {
  return defValue(card.defId) + Math.max(0, card.power - (card.printedPower ?? card.power)) / 2000;
}

export const ON_KO_VALUE = 2;

/**
 * Other conditions (a Leader type, a hand size) are not checked: they are assumed to hold. Trashing does not trigger
 * [On K.O.], so only K.O.s use this.
 */
export function onKoValue(view: BotView, card: BoardCard): number {
  if (card.statusLabels.includes("Effects negated")) return 0;
  const myTurn = view.activeSeat === view.seat;
  const fires = abilitiesFor(card.defId).some((a) => a.trigger === "on_ko"
    && card.attachedDonCount >= (a.don ?? 0)
    && !a.conditions?.some((c) => (c.c === "opponent_turn" && myTurn) || (c.c === "your_turn" && !myTurn)));
  return fires ? ON_KO_VALUE : 0;
}

export function lossValue(view: BotView, card: BoardCard): number {
  return boardValue(card) - onKoValue(view, card);
}

export function isBlocker(card: BoardCard): boolean {
  return card.keywords.includes("blocker");
}

export function findBoardCard(view: BotView, id: string): { card: BoardCard; mine: boolean } | null {
  for (const c of [view.you.leader, ...view.you.characters]) if (c.id === id) return { card: c, mine: true };
  for (const c of [view.opponent.leader, ...view.opponent.characters]) if (c.id === id) return { card: c, mine: false };
  return null;
}

export function pickBest<T>(items: readonly T[], score: (t: T) => number, rng: Rng, eps = 1e-9): T | undefined {
  if (!items.length) return undefined;
  let best = -Infinity;
  for (const it of items) best = Math.max(best, score(it));
  const top = items.filter((it) => score(it) >= best - eps);
  return top[top.length === 1 ? 0 : rng.nextInt(top.length)];
}
