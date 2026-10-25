/**
 * Exhaustive searches over the duel engine's legal intents (#685): the `defend` and `lethal` golds are decided by trying
 * every line the engine allows, not by a rule of thumb. A search gives up (and its puzzle is rejected) when a line meets
 * something the position text cannot ask about: a choice the engine puts to a player, or too many lines to try.
 */
import { applyIntent, createSeededRng, type Intent, type MatchState, type Seat } from "@optcg/rules";

/** The position holds something that makes the answer unfair to ask: a pending choice, or a line the engine refuses. */
export class Unfair extends Error {}

/** The search ran past its node budget. */
export class OverCap extends Error {}

export type Budget = { used: number; cap: number };

/** One intent applied by `seat`; throws `Unfair` when the engine refuses it and `OverCap` when the budget is spent. */
export function step(state: MatchState, intent: Intent, seat: Seat, budget?: Budget): MatchState {
  if (budget) {
    budget.used += 1;
    if (budget.used > budget.cap) throw new OverCap(`more than ${budget.cap} engine steps`);
  }
  const r = applyIntent(state, intent, { seat, rng: createSeededRng(1) });
  if (!r.ok) throw new Unfair(`${intent.type} refused: ${r.error?.message ?? "?"}`);
  return r.state;
}

/** Life cards that were taken are checked one at a time; a card with no [Trigger] is simply added to the hand. */
export function declineLifeChecks(state: MatchState, owner: Seat, budget?: Budget): MatchState {
  let s = state;
  while (s.pendingChoices.length) {
    const front = s.pendingChoices[0]!;
    if (front.kind !== "life_trigger" || !front.noTrigger || front.seat !== owner) throw new Unfair(`a ${front.kind} choice is pending`);
    s = step(s, { type: "resolve_pending_choice", accept: false }, owner, budget);
  }
  return s;
}
