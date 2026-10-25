/**
 * The `defend` puzzle (#685): the opponent's attack has been declared and it is the defender's block step. The question is how
 * few cards from the hand (Counter Characters trashed for their Counter, Counter Events) it takes to lose no Life and keep every
 * Character, with a block allowed. The gold is found by trying every block the engine allows with every set of Counter
 * cards it allows, so it is exact; a position where any line meets a pending choice is not a fair puzzle and makes none.
 */
import { applyIntent, createSeededRng, listLegalIntents, type Intent, type MatchState, type Rng, type Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { boardCards, fullySupported, labelOf, shownCardIds } from "./describe";
import { finish, headOf, pickOf, type Made } from "./generators";
import { step, Unfair } from "./search";

/** More Counter-capable cards than this in the hand and the search would try too many sets: no puzzle. */
export const MAX_COUNTER_CARDS = 6;

const counterIntent = (i: Intent): i is Extract<Intent, { type: "counter_from_hand" | "counter_event" }> => i.type === "counter_from_hand" || i.type === "counter_event";

/** The attack at `intentIndex` of the active seat's legal attacks, declared: the defender's block step with nothing pending. */
export function blockStepOf(state: MatchState, intentIndex: number): MatchState | null {
  const attacker = state.activeSeat;
  const intent = listLegalIntents(state, attacker).filter((i) => i.type === "declare_attack")[intentIndex];
  if (!intent) return null;
  const declared = applyIntent(state, intent, { seat: attacker, rng: createSeededRng(1) });
  if (!declared.ok || declared.state.phase !== "block" || declared.state.pendingChoices.length || !declared.state.battle) return null;
  return declared.state;
}

/** Subsets of `items` with exactly `k` members, in hand order. */
function subsets<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...subsets(rest, k - 1).map((s) => [head!, ...s]), ...subsets(rest, k)];
}

/**
 * The fewest cards used from the defender's hand over every block option and every set of Counter cards, or -1 when no line
 * keeps all Life and all Characters. Null when the position is not a fair puzzle (a pending choice in some line, too many cards).
 */
export function fewestCards(blockStep: MatchState, defender: Seat): number | null {
  try {
    return search(blockStep, defender);
  } catch (e) {
    if (e instanceof Unfair) return null;
    throw e;
  }
}

function search(blockStep: MatchState, defender: Seat): number {
  const before = blockStep.players[defender];
  const lifeBefore = before.life.length;
  const charsBefore = before.characters.map((c) => c.id);
  /** The battle is over and the defender kept all Life and all Characters. */
  const saved = (s: MatchState): boolean => {
    if (s.battle || s.phase !== "main") throw new Unfair("the battle did not end");
    const p = s.players[defender];
    return s.winner === null && p.life.length === lifeBefore && charsBefore.every((id) => p.characters.some((c) => c.id === id));
  };
  /** Plays `ids` (hand cards by instance) as Counters in order, passes, and says whether the defender is saved. */
  const line = (counterStep: MatchState, ids: readonly string[]): boolean => {
    let s = counterStep;
    for (const id of ids) {
      const handIndex = s.players[defender].hand.findIndex((c) => c.id === id);
      const intent = listLegalIntents(s, defender).find((i) => counterIntent(i) && i.handIndex === handIndex);
      if (!intent) return false;
      s = step(s, intent, defender);
      if (s.pendingChoices.length) throw new Unfair("a Counter card asks a question");
    }
    s = step(s, { type: "pass_counter" }, defender);
    if (s.pendingChoices.length) {
      // A Life card that was taken is being checked: the Life is lost whatever the check says.
      if (s.pendingChoices.every((c) => c.kind === "life_trigger" && c.seat === defender)) return false;
      throw new Unfair("a choice is pending after the battle");
    }
    return saved(s);
  };

  let best = Infinity;
  for (const block of listLegalIntents(blockStep, defender).filter((i) => i.type === "pass_block" || i.type === "declare_block")) {
    const afterBlock = step(blockStep, block, defender);
    if (afterBlock.pendingChoices.length) throw new Unfair("a block opens a choice");
    if (!afterBlock.battle) {
      // The block ended the battle (a Character left the field); nothing more to play.
      if (saved(afterBlock)) best = 0;
      continue;
    }
    if (afterBlock.phase !== "counter") throw new Unfair("not the counter step");
    const hand = afterBlock.players[defender].hand;
    const usable = listLegalIntents(afterBlock, defender).filter(counterIntent).map((i) => hand[i.handIndex]!.id);
    if (usable.length > MAX_COUNTER_CARDS) throw new Unfair("too many Counter cards");
    found: for (let k = 0; k < Math.min(best, usable.length + 1); k += 1) {
      for (const ids of subsets(usable, k)) {
        if (line(afterBlock, ids)) {
          best = k;
          break found;
        }
      }
    }
  }
  return best === Infinity ? -1 : best;
}

/** Share of defend puzzles whose answer is 1 or more cards, "cannot be done" (-1), or no cards at all (0), by first tag. */
export const DEFEND_MIX: Record<string, number> = { "cards-needed": 0.65, impossible: 0.2, "no-cards-needed": 0.15 };

const KINDS = { "cards-needed": "needed", impossible: "impossible", "no-cards-needed": "none" } as const;

/** `prefer` names the kind of answer to ask about when the position has one (a key of `DEFEND_MIX`). */
export function defendPuzzle(state: MatchState, catalog: Catalog, rng: Rng, prefer?: string): Made | null {
  const attacker = state.activeSeat;
  const view = (1 - attacker) as Seat;
  if (!fullySupported(catalog, shownCardIds(state, view))) return null;
  const attackCount = listLegalIntents(state, attacker).filter((i) => i.type === "declare_attack").length;
  if (!attackCount) return null;
  const order = rng.shuffle(Array.from({ length: attackCount }, (_, i) => i)).slice(0, 6);
  const battles = order.flatMap((index) => {
    const blockStep = blockStepOf(state, index);
    const gold = blockStep ? fewestCards(blockStep, view) : null;
    return blockStep && gold !== null ? [{ blockStep, gold }] : [];
  });
  const buckets = { impossible: battles.filter((b) => b.gold < 0), none: battles.filter((b) => b.gold === 0), needed: battles.filter((b) => b.gold > 0) };
  // Asked for a kind, take it if the position has it, else whatever it has; with no preference, mostly a puzzle that needs cards.
  const wanted = prefer ? KINDS[prefer as keyof typeof KINDS] : undefined;
  const roll = rng.next();
  const kind =
    wanted && buckets[wanted].length
      ? wanted
      : !prefer && roll < DEFEND_MIX.impossible! && buckets.impossible.length
        ? "impossible"
        : !prefer && roll < DEFEND_MIX.impossible! + DEFEND_MIX["no-cards-needed"]! && buckets.none.length
          ? "none"
          : (["needed", "impossible", "none"] as const).find((k) => buckets[k].length);
  if (!kind) return null;
  const chosen = pickOf(rng, buckets[kind]);
  const s = chosen.blockStep;
  const b = s.battle!;
  const find = (seat: Seat, id: string) => boardCards(s, seat).find((c) => c.id === id)!;
  const atk = find(attacker, b.attackerId);
  const def = b.target.kind === "leader" ? s.players[view].leader : find(view, b.target.instanceId);
  const onLeader = def.id === s.players[view].leader.id;
  const ids = shownCardIds(s, view, [atk.defId]);
  if (!fullySupported(catalog, ids)) return null;
  const effectsLive = s.modifiers.some((m) => m.effect.type !== "flag");
  const turn = `Turn ${s.turnNumber}. It is your opponent's turn. Their ${labelOf(catalog, atk.defId)} is attacking your ${onLeader ? "Leader" : "Character"} ${labelOf(catalog, def.defId)}. The attack has been declared${effectsLive ? " (any effect that triggered on the declaration has already resolved)" : ""} and it is your block step: you have not blocked yet. No effect is waiting to resolve.`;
  const question = "What is the fewest cards from your hand you must use (Counter Characters trashed for their Counter, or Counter Events) so that you lose no Life and none of your Characters is K.O.'d in this battle? You may also block. Answer -1 if it cannot be done.";
  const blockers = listLegalIntents(s, view).filter((i) => i.type === "declare_block").length;
  const tags = [chosen.gold < 0 ? "impossible" : chosen.gold === 0 ? "no-cards-needed" : "cards-needed", onLeader ? "leader-target" : "character-target", blockers ? "can-block" : "no-blocker"];
  return finish("defend", catalog, headOf(s, view, catalog, turn, { attackerId: atk.id }), ids, question, '{"cards": <number>}', { key: "cards", mode: "number", value: chosen.gold }, tags);
}
