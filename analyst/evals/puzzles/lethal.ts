/**
 * The `lethal` puzzle (#685): the most damage the active seat can be sure to deal this turn on a small board, with the
 * defender answering every attack as well as they can. The gold is an exact minimax over the engine's legal intents: the
 * attacker gives DON!!, attacks or ends the turn; the defender passes or blocks, then plays Counter cards one at a time or
 * passes; the engine resolves every battle. The search is exact and cuts only lines that provably cannot change the number (see
 * `solve`); it is checked against the plain search on small boards. Positions are memoised on a canonical key, the search has a
 * budget of engine steps, and a position that hits it, or meets a choice the text cannot pose, makes no puzzle.
 */
import { counterOf, getCardDef, hasKeyword, listLegalIntents, powerOf, type Intent, type MatchState, type Rng, type Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { fullySupported, labelOf, shownCardIds } from "./describe";
import { finish, headOf, type Made } from "./generators";
import { lethalPool } from "./positions";
import { declineLifeChecks, OverCap, step, Unfair, type Budget } from "./search";

export const LETHAL_NODE_CAP = 40_000;

export type LethalValue = {
  /** Damage the attacker is sure to deal: the defender's best answers cannot hold it lower. */
  value: number;
  /** The same with a defender who never blocks and never counters: every attack lands. */
  undefended: number;
  ceiling: number;
  steps: number;
};

const mods = (s: MatchState) => s.modifiers.map((m) => JSON.stringify([m.target, m.effect, m.expires])).sort();
const piece = (c: MatchState["players"][number]["leader"], counted = true) => [c.defId, c.rested, counted ? c.attachedDonIds.length : 0];

function keyOf(s: MatchState): string {
  const b = s.battle;
  return JSON.stringify([
    s.phase,
    s.winner,
    b ? [b.attackerId, b.target, b.blockerId ? 1 : 0] : null,
    mods(s),
    s.players.map((p, seat) => [
      piece(p.leader, !p.leader.rested || p.leader.id === b?.attackerId),
      seat === s.activeSeat ? p.characters.map((c) => JSON.stringify(piece(c, !c.rested || c.id === b?.attackerId))).sort() : p.characters.filter((c) => !c.rested && hasKeyword(s, seat as Seat, c, "blocker")).length,
      p.hand.map((c) => c.defId).sort(),
      p.life.length,
      p.costArea.filter((d) => !d.rested).length,
      p.costArea.filter((d) => d.rested).length,
    ]),
  ]);
}

/**
 * The answer to the target a Counter Event asks for ("up to 1 of your Leader or Character cards gains +N power during this battle").
 * Power added to the card that is being attacked can only help the defender and added to any other card does nothing, so the
 * card in the battle is the one answer worth trying; any other choice is a position this search does not pose.
 */
export function answersTo(s: MatchState): Intent[] {
  const front = s.pendingChoices[0];
  const request = front?.request;
  const b = s.battle;
  if (!front || !b || front.kind !== "effect" || request?.type !== "select" || request.max !== 1 || request.min > 1) throw new Unfair("a choice other than a target is pending");
  const inBattle = b.target.kind === "leader" ? s.players[(1 - b.attackerSeat) as Seat].leader.id : b.target.instanceId;
  const option = request.options.find((o) => o.instanceId === inBattle);
  if (!option) throw new Unfair("the card in the battle is not among the targets");
  return [{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] }];
}

function counterReserve(s: MatchState, defender: Seat): number {
  let total = 0;
  for (const c of s.players[defender].hand) {
    const def = getCardDef(c.defId);
    const event = def.type === "event" ? /gains \+(\d+) power/.exec(def.effectText ?? "") : null;
    if (def.type === "event" && !event) return Infinity;
    total += def.type === "event" ? Number(event![1]) : counterOf(s, defender, c);
  }
  return total;
}

const sameKind = (s: MatchState, seat: Seat, intent: Intent): string => {
  const p = s.players[seat];
  if (intent.type === "declare_attack") {
    const c = intent.attackerId === p.leader.id ? p.leader : p.characters.find((x) => x.id === intent.attackerId)!;
    return `a${intent.attackerId === p.leader.id ? "L" : "C"}${c.defId}`;
  }
  if (intent.type === "declare_block") return `b${p.characters.find((x) => x.id === intent.blockerId)!.defId}`;
  if (intent.type === "counter_from_hand" || intent.type === "counter_event") return `${intent.type}${p.hand[intent.handIndex]!.defId}`;
  return intent.type;
};

const firstOfKind = (s: MatchState, seat: Seat, intents: Intent[]): Intent[] => {
  const seen = new Set<string>();
  return intents.filter((i) => {
    const k = sameKind(s, seat, i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Exact value of the position for the active seat. `undefended` makes the defender pass every block and every counter step.
 *
 * The search asks "can the attacker be sure of at least `t` damage?" (a yes or no that stops at the first line that settles
 * it) for t = 1, 2 ...; the answers are kept per position as a lower and an upper bound on its value, so one question's work
 * serves the next. Lines that cannot change the answer are not tried: interchangeable cards, and DON!! given to an attacker
 * that is too weak to win the battle or already strong enough to win it however the defender answers.
 */
function solve(start: MatchState, undefended: boolean, cap: number): { value: number; steps: number } {
  const attacker = start.activeSeat;
  const defender = (1 - attacker) as Seat;
  const startLife = start.players[defender].life.length;
  const budget: Budget = { used: 0, cap };
  const ceiling = startLife + 1;
  const dealt = (s: MatchState) => startLife - s.players[defender].life.length + (s.winner === attacker ? 1 : 0);
  const reach = (s: MatchState) => {
    const p = s.players[attacker];
    return [p.leader, ...p.characters].filter((c) => !c.rested || c.id === s.battle?.attackerId).reduce((n, c) => n + (hasKeyword(s, attacker, c, "double_attack") ? 2 : 1), 0);
  };
  type Bound = { lo: number; hi: number };
  const memo = new Map<string, Bound>();
  const atLeast = (key: string, s: MatchState, t: number, compute: () => boolean): boolean => {
    let entry = memo.get(key);
    if (!entry) memo.set(key, (entry = { lo: dealt(s), hi: Math.min(ceiling, dealt(s) + reach(s)) }));
    if (t <= entry.lo) return true;
    if (t > entry.hi) return false;
    const yes = compute();
    if (yes) entry.lo = Math.max(entry.lo, t);
    else entry.hi = Math.min(entry.hi, t - 1);
    return yes;
  };

  const main = (s: MatchState, t: number): boolean => {
    if (s.winner !== null) return dealt(s) >= t;
    if (s.phase !== "main" || s.battle || s.pendingChoices.length) throw new Unfair("not a Main Phase");
    return atLeast(`m${keyOf(s)}`, s, t, () => {
      if (dealt(s) >= t) return true;
      if (t > ceiling) return false;
      const p = s.players[attacker];
      const foe = s.players[defender];
      const legal = listLegalIntents(s, attacker);
      for (const intent of legal) if (intent.type !== "end_turn" && intent.type !== "give_don" && intent.type !== "declare_attack") throw new Unfair(`${intent.type} is legal`);
      const donCount = p.costArea.filter((d) => !d.rested).length;
      const reserve = undefended ? 0 : counterReserve(s, defender);
      // An attack on a rested Character deals no damage and the defender can let it through: it only rests the attacker, so it is never better than not attacking.
      for (const attack of firstOfKind(s, attacker, legal.filter((i) => i.type === "declare_attack" && i.target.kind === "leader"))) {
        if (attack.type !== "declare_attack") continue;
        const floor = powerOf(s, defender, foe.leader);
        const roof = floor + reserve;
        const tries: MatchState[] = [];
        let ready = s;
        for (let k = 0; k <= donCount; k += 1) {
          if (k > 0) ready = step(ready, { type: "give_don", donId: ready.players[attacker].costArea.find((d) => !d.rested)!.id, targetId: attack.attackerId }, attacker, budget);
          const mine = powerOf(ready, attacker, attack.attackerId === p.leader.id ? ready.players[attacker].leader : ready.players[attacker].characters.find((c) => c.id === attack.attackerId)!);
          if (mine < floor) continue;
          tries.push(ready);
          if (mine >= roof) break;
        }
        for (const go of tries.reverse()) if (answer(step(go, attack, attacker, budget), t)) return true;
      }
      return false;
    });
  };

  const answer = (s: MatchState, t: number): boolean => {
    if (s.pendingChoices.length || s.phase !== "block") throw new Unfair("the declared attack opens a choice");
    return atLeast(`b${keyOf(s)}`, s, t, () => {
      const blocks = firstOfKind(s, defender, listLegalIntents(s, defender).filter((i) => i.type === "pass_block" || (!undefended && i.type === "declare_block")));
      return blocks.every((b) => counters(step(s, b, defender, budget), t));
    });
  };

  const counters = (s: MatchState, t: number): boolean => {
    if (s.winner !== null || (s.phase === "main" && !s.battle && !s.pendingChoices.length)) return main(s, t);
    if (s.phase !== "counter" || s.pendingChoices.length) throw new Unfair("not the counter step");
    return atLeast(`c${keyOf(s)}`, s, t, () => {
      const intents = firstOfKind(s, defender, listLegalIntents(s, defender).filter((i) => i.type === "pass_counter" || (!undefended && (i.type === "counter_from_hand" || i.type === "counter_event"))));
      return intents.every((i) => {
        const next = step(s, i, defender, budget);
        if (i.type === "pass_counter") return main(declineLifeChecks(next, defender, budget), t);
        if (!next.pendingChoices.length) return counters(next, t);
        return answersTo(next).every((a) => counters(step(next, a, defender, budget), t));
      });
    });
  };

  let value = 0;
  while (value < ceiling && main(start, value + 1)) value += 1;
  return { value, steps: budget.used };
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
