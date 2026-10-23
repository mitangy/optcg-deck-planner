/**
 * The `lethal` puzzle (#685): the most damage the active seat can be sure to deal this turn on a small board, with the
 * defender answering every attack as well as they can. The gold is an exact minimax over the engine's legal intents: the
 * attacker gives DON!!, attacks or ends the turn; the defender passes or blocks, then plays Counter cards one at a time or
 * passes; the engine resolves every battle. Positions are memoised on a canonical key, the search has a budget of engine steps, and a
 * position that hits it, or meets a choice the text cannot pose, makes no puzzle.
 */
import { listLegalIntents, type Intent, type MatchState, type Rng, type Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { fullySupported, labelOf, shownCardIds } from "./describe";
import { finish, headOf, type Made } from "./generators";
import { lethalPool } from "./positions";
import { declineLifeChecks, OverCap, step, Unfair, type Budget } from "./search";

/** The default node budget: engine steps one search may spend before its position is turned down. */
export const LETHAL_NODE_CAP = 40_000;

export type LethalValue = {
  /** Damage the attacker is sure to deal: the defender's best answers cannot hold it lower. */
  value: number;
  /** The same with a defender who never blocks and never counters: every attack lands. */
  undefended: number;
  /** Most the attacker could ever deal: every Life card, and the hit on the Leader after them. */
  ceiling: number;
  steps: number;
};

const mods = (s: MatchState) => s.modifiers.map((m) => JSON.stringify([m.target, m.effect, m.expires])).sort();
const piece = (c: MatchState["players"][number]["leader"], counted = true) => [c.defId, c.rested, counted ? c.attachedDonIds.length : 0];

/** What decides the rest of the search, with instance ids left out wherever two cards of one kind are interchangeable. */
function keyOf(s: MatchState): string {
  const b = s.battle;
  return JSON.stringify([
    s.phase,
    s.winner,
    b ? [b.attackerId, b.target, b.blockerId ?? null] : null,
    mods(s),
    // DON!! on a card that has attacked and is out of the battle changes nothing any more.
    s.players.map((p) => [piece(p.leader, !p.leader.rested || p.leader.id === b?.attackerId), p.characters.map((c) => JSON.stringify(piece(c, !c.rested || c.id === b?.attackerId))).sort(), p.hand.map((c) => c.defId).sort(), p.life.length, p.costArea.filter((d) => !d.rested).length, p.costArea.filter((d) => d.rested).length]),
  ]);
}

/**
 * The answer to the target a Counter Event asks for ("up to 1 of your Leader or Character cards gains +N power during this battle").
 * Power added to the card that is being attacked can only help the defender and added to any other card does nothing, so the
 * card in the battle is the one answer worth trying; any other choice is a position this search does not pose.
 */
function answersTo(s: MatchState): Intent[] {
  const front = s.pendingChoices[0];
  const request = front?.request;
  const b = s.battle;
  if (!front || !b || front.kind !== "effect" || request?.type !== "select" || request.max !== 1 || request.min > 1) throw new Unfair("a choice other than a target is pending");
  const inBattle = b.target.kind === "leader" ? s.players[(1 - b.attackerSeat) as Seat].leader.id : b.target.instanceId;
  const option = request.options.find((o) => o.instanceId === inBattle);
  if (!option) throw new Unfair("the card in the battle is not among the targets");
  return [{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] }];
}

/**
 * Exact value of the position for the active seat. `undefended` makes the defender pass every block and every counter step.
 */
function solve(start: MatchState, undefended: boolean, cap: number): { value: number; steps: number } {
  const attacker = start.activeSeat;
  const defender = (1 - attacker) as Seat;
  const startLife = start.players[defender].life.length;
  const budget: Budget = { used: 0, cap };
  const ceiling = startLife + 1;
  const dealt = (s: MatchState) => startLife - s.players[defender].life.length + (s.winner === attacker ? 1 : 0);
  const memo = new Map<string, number>();
  const cached = (key: string, compute: () => number): number => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = compute();
    memo.set(key, v);
    return v;
  };

  /**
   * The attacker's Main Phase: end the turn now, or attack. DON!! is given just before the attack it is for, to the attacking
   * card, 0 to all of it: a DON!! given earlier does the same thing with less to go on, and the Leaders of these boards have no
   * [DON!! xN] static that would let DON!! on one card change another's power.
   */
  const main = (s: MatchState): number => {
    if (s.winner !== null) return dealt(s);
    if (s.phase !== "main" || s.battle || s.pendingChoices.length) throw new Unfair("not a Main Phase");
    return cached(`m${keyOf(s)}`, () => {
      let best = dealt(s);
      if (best >= ceiling) return best;
      const p = s.players[attacker];
      const legal = listLegalIntents(s, attacker);
      for (const intent of legal) if (intent.type !== "end_turn" && intent.type !== "give_don" && intent.type !== "declare_attack") throw new Unfair(`${intent.type} is legal`);
      const donCount = p.costArea.filter((d) => !d.rested).length;
      for (const attack of legal) {
        if (attack.type !== "declare_attack") continue;
        let ready = s;
        for (let k = 0; k <= donCount; k += 1) {
          if (k > 0) ready = step(ready, listLegalIntents(ready, attacker).find((i) => i.type === "give_don" && i.targetId === attack.attackerId)!, attacker, budget);
          best = Math.max(best, answer(step(ready, attack, attacker, budget)));
          if (best >= ceiling) return best;
        }
      }
      return best;
    });
  };

  /** The block step: the defender blocks with whichever Blocker the engine allows, or does not, whichever is worse for the attacker. */
  const answer = (s: MatchState): number => {
    if (s.pendingChoices.length || s.phase !== "block") throw new Unfair("the declared attack opens a choice");
    const blocks = listLegalIntents(s, defender).filter((i) => i.type === "pass_block" || (!undefended && i.type === "declare_block"));
    return Math.min(...blocks.map((b) => counters(step(s, b, defender, budget))));
  };

  /** The counter step: the defender plays Counter cards one at a time, or passes and the battle resolves. */
  const counters = (s: MatchState): number => {
    if (s.winner !== null || (s.phase === "main" && !s.battle && !s.pendingChoices.length)) return main(s);
    if (s.phase !== "counter" || s.pendingChoices.length) throw new Unfair("not the counter step");
    return cached(`c${keyOf(s)}`, () => {
      const intents = listLegalIntents(s, defender).filter((i) => i.type === "pass_counter" || (!undefended && (i.type === "counter_from_hand" || i.type === "counter_event")));
      return Math.min(
        ...intents.map((i) => {
          const next = step(s, i, defender, budget);
          if (i.type === "pass_counter") return main(declineLifeChecks(next, defender, budget));
          if (!next.pendingChoices.length) return counters(next);
          return Math.min(...answersTo(next).map((a) => counters(step(next, a, defender, budget))));
        }),
      );
    });
  };

  return { value: main(start), steps: budget.used };
}

/**
 * The most damage the active seat is sure to deal (see the file comment), with what an undefended turn would deal and the most
 * possible. Null when the search runs past `cap` engine steps or meets a choice it cannot pose.
 */
export function lethalValue(state: MatchState, cap = LETHAL_NODE_CAP): LethalValue | null {
  try {
    const best = solve(state, false, cap);
    const open = solve(state, true, cap);
    return { value: best.value, undefended: open.value, ceiling: state.players[(1 - state.activeSeat) as Seat].life.length + 1, steps: best.steps + open.steps };
  } catch (e) {
    if (e instanceof Unfair || e instanceof OverCap) return null;
    throw e;
  }
}

/** Shares of puzzles kept when nothing is at stake: no damage at all, or a defender who cannot change the outcome. */
export const LETHAL_KEEP = { none: 0.15, undefended: 0.3 };

export function lethalPuzzle(state: MatchState, catalog: Catalog, rng: Rng, cap = LETHAL_NODE_CAP): Made | null {
  const view = state.activeSeat;
  const pool = lethalPool(catalog);
  const ids = [...new Set([...shownCardIds(state, view, [pool.lifeFiller], true)])];
  if (!fullySupported(catalog, ids)) return null;
  // A defender with no active Blocker and no Counter card cannot change anything: most such boards are turned down unsolved.
  const opp = state.players[(1 - view) as Seat];
  const canAnswer = opp.characters.some((c) => !c.rested && lethalPool(catalog).blockers.includes(c.defId)) || opp.hand.length > 0;
  if (!canAnswer && rng.next() >= LETHAL_KEEP.undefended) return null;
  const found = lethalValue(state, cap);
  if (!found) return null;
  // The set should be mostly boards where the defender's answers or the order of the attacks change the number.
  if (found.value === 0 && rng.next() >= LETHAL_KEEP.none) return null;
  if (found.value === found.undefended && rng.next() >= LETHAL_KEEP.undefended) return null;
  const turn = [
    `Turn ${state.turnNumber}. It is your turn and you are in your Main Phase; no effect is waiting to resolve.`,
    "Every Character you control was played on an earlier turn, so each can attack. You have no cards in hand. Your opponent's hand is shown face up for this puzzle.",
    `Each of your opponent's Life cards is ${labelOf(catalog, pool.lifeFiller)}, which has no [Trigger] and no Counter; a Life card that is taken goes to its owner's hand. No other effect is in play.`,
  ].join(" ");
  const question = "Your opponent will defend as well as they can. What is the most damage you can be sure to deal this turn? Each Life card your opponent loses counts 1, and a hit on their Leader when they have no Life (which wins the game) counts 1 more.";
  const kind = found.value === 0 ? "no-damage" : found.value >= found.ceiling ? "forced-win" : found.value < found.undefended ? "defender-matters" : "defender-irrelevant";
  const tags = [kind, `${opp.life.length}-life`, opp.hand.length ? "counters-in-hand" : "empty-hand", opp.characters.some((c) => !c.rested) ? "untapped-defender" : "no-untapped-defender"];
  return finish("lethal", catalog, headOf(state, view, catalog, turn, { showHand: true }), ids, question, '{"damage": <number>}', { key: "damage", mode: "number", value: found.value }, tags);
}
