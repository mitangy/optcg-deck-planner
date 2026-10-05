import { lookupCard } from "../cards/atlas";
import { counterClause } from "../cards/counterValue";
import type { Intent } from "../net/protocol";
import { matchCounter } from "./dragIntents";

type HandCard = { id: string; defId: string; counter?: number };

/**
 * Block step: will the counter step accept this hand card? Mirrors the
 * engine's counter-step list: a Character with a Counter above 0 (the live
 * value when the server sends it, else the printed one), or an Event with a
 * [Counter] clause you can pay for with your active DON!!.
 */
export function counterAfterBlock(card: HandCard, activeDon: number): boolean {
  const entry = lookupCard(card.defId);
  if (entry.type === "character")
    return (card.counter ?? entry.counter ?? 0) > 0;
  if (entry.type === "event") {
    return counterClause(entry.effectText) != null && entry.cost <= activeDon;
  }
  return false;
}

/**
 * A counter waiting for the block step to pass. `settled` is false while the
 * block step is still up (the pass has not landed yet); once it has, `intent`
 * is the card's counter if the counter step lists it, else null (the step
 * moved on some other way, or the card cannot counter after all).
 */
export function followUpCounter(
  intents: readonly Intent[],
  hand: readonly HandCard[],
  cardId: string,
): { settled: boolean; intent: Intent | null } {
  if (intents.some((i) => i.type === "pass_block"))
    return { settled: false, intent: null };
  if (!intents.some((i) => i.type === "pass_counter"))
    return { settled: true, intent: null };
  const handIndex = hand.findIndex((c) => c.id === cardId);
  const intent =
    handIndex >= 0 ? matchCounter(intents as Intent[], handIndex) : null;
  return { settled: true, intent };
}
