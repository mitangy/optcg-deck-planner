/**
 * The puzzle types (#677). Each generator takes one position and returns a puzzle whose gold comes from the duel
 * engine (powerOf, the legal-intent list, an actual battle), or null when the position cannot make a fair puzzle.
 */
import { applyIntent, listLegalIntents, powerOf, type CardInstance, type MatchState, type Rng, type Seat } from "@optcg/rules";
import { addModifier } from "@optcg/rules/src/engine/modifiers";
import type { Catalog } from "../../src/catalog";
import { assemble, boardCards, describeSeat, fullySupported, hasNewSet, labelOf, shownCardIds } from "./describe";
import type { Gold, Puzzle, PuzzleType } from "./types";

export type Made = Omit<Puzzle, "id" | "source">;

const side = (seat: Seat, view: Seat) => (seat === view ? "your" : "your opponent's");
const sorted = (xs: readonly string[]) => [...xs].sort();
export const pickOf = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.nextInt(xs.length)]!;

export function headOf(state: MatchState, view: Seat, catalog: Catalog, turnLine: string, opts: { attackerId?: string; showHand?: boolean } = {}): string[] {
  return [turnLine, ...describeSeat(state, view, catalog, "Your", opts), ...describeSeat(state, (1 - view) as Seat, catalog, "Opponent's", opts)];
}

const mainLine = (state: MatchState) => `Turn ${state.turnNumber}. It is your turn and you are in your Main Phase; no effect is waiting to resolve.`;

export function finish(type: PuzzleType, catalog: Catalog, head: string[], ids: string[], question: string, schema: string, gold: Gold, tags: string[]): Made | null {
  const text = assemble(catalog, head, ids, question, schema);
  if (!text) return null;
  return { type, tags, newSet: hasNewSet(ids), position: text.position, cards: ids, question, schema, message: text.message, gold };
}

export const POWER_MIX: Record<string, number> = { modified: 0.6, "idle-don": 0.15, plain: 0.25 };

export function powerPuzzle(state: MatchState, catalog: Catalog, rng: Rng, prefer?: string): Made | null {
  const view = state.activeSeat;
  const ids = shownCardIds(state, view);
  if (!fullySupported(catalog, ids)) return null;
  const targets = ([0, 1] as Seat[]).flatMap((seat) => [state.players[seat].leader, ...state.players[seat].characters].map((card) => ({ seat, card })));
  const unique = targets.filter((t) => targets.filter((u) => u.card.defId === t.card.defId).length === 1);
  const groups = new Map<string, typeof unique>();
  for (const t of unique) {
    const printed = catalog.cards.get(t.card.defId)?.power;
    const now = powerOf(state, t.seat, t.card);
    const tag = now !== printed ? "modified" : t.card.attachedDonIds.length > 0 && t.seat !== state.activeSeat ? "idle-don" : "plain";
    groups.set(tag, [...(groups.get(tag) ?? []), t]);
  }
  if (!groups.size) return null;
  const tag = prefer && groups.has(prefer) ? prefer : pickOf(rng, [...groups.keys()]);
  const target = pickOf(rng, groups.get(tag)!);
  const kind = target.card.id === state.players[target.seat].leader.id ? "Leader" : "Character";
  const question = `What is the power of ${side(target.seat, view)} ${kind} ${labelOf(catalog, target.card.defId)} right now?`;
  return finish("power", catalog, headOf(state, view, catalog, mainLine(state)), ids, question, '{"power": <number>}', { key: "power", mode: "number", value: powerOf(state, target.seat, target.card) }, [tag]);
}

export function playableCards(state: MatchState, seat: Seat): Set<string> {
  const hand = state.players[seat].hand;
  return new Set(listLegalIntents(state, seat).flatMap((i) => (i.type === "play_card" ? [hand[i.handIndex]!.id] : [])));
}

export function attackerCards(state: MatchState, seat: Seat): Set<string> {
  return new Set(listLegalIntents(state, seat).flatMap((i) => (i.type === "declare_attack" ? [i.attackerId] : [])));
}

const idsOf = (cards: readonly CardInstance[], able: ReadonlySet<string>): string[] => [...new Set(cards.filter((c) => able.has(c.id)).map((c) => c.defId))];

export const playableIds = (state: MatchState, seat: Seat): string[] => idsOf(state.players[seat].hand, playableCards(state, seat));

export const attackerIds = (state: MatchState, seat: Seat): string[] => idsOf(state.players[seat].characters, attackerCards(state, seat));

const consistent = (cards: readonly CardInstance[], able: ReadonlySet<string>) =>
  cards.every((c) => cards.filter((d) => d.defId === c.defId).every((d) => able.has(d.id) === able.has(c.id)));

const HAND_HELP = /play[^.]*from your hand|cost[^.]*reduced|reduce[^.]*cost/i;

export function handAbilityLegal(state: MatchState, seat: Seat, catalog: Catalog): boolean {
  const sources = [state.players[seat].leader, ...state.players[seat].characters];
  return listLegalIntents(state, seat).some((i) => {
    if (i.type !== "activate_ability") return false;
    const source = sources.find((c) => c.id === i.sourceId);
    return !!source && HAND_HELP.test(catalog.cards.get(source.defId)?.text ?? "");
  });
}

/**
 * What the engine counts as playable (the gold): a Character or Stage whose cost the active DON!! pays (a Character also when
 * 5 Characters are in play, one is trashed to make room), and an Event that has a [Main] effect, whose header gates are open
 * (a [DON!! xN] or once-per-turn), whatever that effect would do. An Event with no [Main] (a [Counter] or [Trigger] only) is
 * never playable now, and abilities of other cards are not used first.
 */
export const PLAYABLE_QUESTION =
  "Which cards in your hand could you play right now by paying their cost, without first using any other card's ability? Count a Character even if you'd have to trash one of your 5 Characters to make room. Count an Event when the game lets you play it now for its [Main] effect, even if that effect would do nothing (an optional cost you can't pay and an effect with no target don't stop it); an Event with no [Main] effect (only a [Counter] or [Trigger]) can't be played now.";

export const PLAYABLE_ABILITY_NOTE = " You do have an [Activate: Main] ability that could play a card from your hand or lower a cost; count only the cards you could play without using it.";

export function playablePuzzle(state: MatchState, catalog: Catalog, rng: Rng): Made | null {
  const view = state.activeSeat;
  const hand = state.players[view].hand;
  const ids = shownCardIds(state, view);
  if (hand.length < 2 || !fullySupported(catalog, ids)) return null;
  const yes = playableIds(state, view);
  if (!consistent(hand, playableCards(state, view))) return null;
  const mixed = yes.length > 0 && yes.length < new Set(hand.map((c) => c.defId)).size;
  const trap = handAbilityLegal(state, view, catalog);
  if (!mixed && !trap && rng.next() < 0.85) return null;
  const question = PLAYABLE_QUESTION + (trap ? PLAYABLE_ABILITY_NOTE : "");
  const tags = [yes.length === 0 ? "none-playable" : mixed ? "mixed" : "all-playable", ...(trap ? ["ability-trap"] : [])];
  return finish("playable", catalog, headOf(state, view, catalog, mainLine(state)), ids, question, '{"cards": ["<card number>", ...]}', { key: "cards", mode: "set", value: sorted(yes) }, tags);
}

export function canAttackPuzzle(state: MatchState, catalog: Catalog, rng: Rng): Made | null {
  const view = state.activeSeat;
  const p = state.players[view];
  const ids = shownCardIds(state, view);
  if (p.characters.length < 2 || !fullySupported(catalog, ids)) return null;
  const yes = attackerIds(state, view);
  if (!consistent(p.characters, attackerCards(state, view))) return null;
  const mixed = yes.length > 0 && yes.length < new Set(p.characters.map((c) => c.defId)).size;
  if (!mixed && rng.next() < 0.85) return null;
  const question = "Which of your Characters can attack right now (at your opponent's Leader or at one of their Characters)?";
  const tags = [yes.length === 0 ? "none-attack" : mixed ? "mixed" : "all-attack"];
  return finish("can_attack", catalog, headOf(state, view, catalog, mainLine(state)), ids, question, '{"characters": ["<card number>", ...]}', { key: "characters", mode: "set", value: sorted(yes) }, tags);
}

const COUNTER_STEP = 1000;
const COUNTER_MAX = 15000;

export function attackSucceeds(counterStep: MatchState, defenderSeat: Seat, defenderId: string, counter: number): boolean | null {
  const s = structuredClone(counterStep);
  if (counter) addModifier(s, defenderSeat, undefined, { kind: "card", id: defenderId }, { type: "power", amount: counter }, { kind: "battle" });
  const r = applyIntent(s, { type: "pass_counter" }, { seat: defenderSeat });
  if (!r.ok) return null;
  const resolved = r.events.find((e) => e.type === "battle_resolved");
  return resolved && resolved.type === "battle_resolved" ? resolved.attackerWon : null;
}

export type CounterBattle = { counterStep: MatchState; defenderSeat: Seat; defenderId: string; attackerId: string; gold: number };

export function counterBattle(state: MatchState, intentIndex: number): CounterBattle | null {
  const attacker = state.activeSeat;
  const defender = (1 - attacker) as Seat;
  const attacks = listLegalIntents(state, attacker).filter((i) => i.type === "declare_attack");
  const intent = attacks[intentIndex];
  if (!intent || intent.type !== "declare_attack") return null;
  const declared = applyIntent(state, intent, { seat: attacker });
  if (!declared.ok || declared.state.phase !== "block" || declared.state.pendingChoices.length) return null;
  const passed = applyIntent(declared.state, { type: "pass_block" }, { seat: defender });
  if (!passed.ok || passed.state.phase !== "counter" || passed.state.pendingChoices.length || !passed.state.battle) return null;
  const b = passed.state.battle;
  const defenderId = b.target.kind === "leader" ? passed.state.players[defender].leader.id : b.target.instanceId;
  for (let counter = 0; counter <= COUNTER_MAX; counter += COUNTER_STEP) {
    const through = attackSucceeds(passed.state, defender, defenderId, counter);
    if (through === null) return null;
    if (!through) return { counterStep: passed.state, defenderSeat: defender, defenderId, attackerId: b.attackerId, gold: counter };
  }
  return null;
}

export function counterPuzzle(state: MatchState, catalog: Catalog, rng: Rng): Made | null {
  const attacker = state.activeSeat;
  const attackCount = listLegalIntents(state, attacker).filter((i) => i.type === "declare_attack").length;
  if (!attackCount) return null;
  const order = rng.shuffle(Array.from({ length: attackCount }, (_, i) => i)).slice(0, 8);
  const battles = order.flatMap((index) => counterBattle(state, index) ?? []);
  const big = battles.filter((b) => b.gold >= 2 * COUNTER_STEP);
  const some = battles.filter((b) => b.gold > 0);
  const chosen = big.length && rng.next() < 0.5 ? pickOf(rng, big) : some.length ? pickOf(rng, some) : battles.length && rng.next() < 0.15 ? pickOf(rng, battles) : undefined;
  for (const battle of chosen ? [chosen] : []) {
    const s = battle.counterStep;
    const view = battle.defenderSeat;
    const find = (seat: Seat, id: string) => boardCards(s, seat).find((c) => c.id === id)!;
    const atk = find(attacker, battle.attackerId);
    const def = find(view, battle.defenderId);
    const onLeader = def.id === s.players[view].leader.id;
    const ids = shownCardIds(s, view, [atk.defId]);
    if (!fullySupported(catalog, ids)) return null;
    const effectsLive = s.modifiers.some((m) => m.effect.type !== "flag");
    const turn = `Turn ${s.turnNumber}. It is your opponent's turn. Their ${labelOf(catalog, atk.defId)} is attacking your ${onLeader ? "Leader" : "Character"} ${labelOf(catalog, def.defId)}. You did not block, and it is now the counter step.${effectsLive ? " Any effect that triggered when the attack was declared has already resolved." : ""}`;
    const question = `What is the least total Counter power (counters come in multiples of 1000) you must add to your ${labelOf(catalog, def.defId)} for the attack to fail? Answer 0 if it fails without any Counter.`;
    const tags = [onLeader ? "leader-target" : "character-target", ...(def.attachedDonIds.length ? ["defender-don-idle"] : []), ...(atk.attachedDonIds.length ? ["attacker-don"] : []), battle.gold === 0 ? "no-counter-needed" : "counter-needed"];
    return finish("counter_needed", catalog, headOf(s, view, catalog, turn, { attackerId: atk.id }), ids, question, '{"counter": <number>}', { key: "counter", mode: "number", value: battle.gold }, tags);
  }
  return null;
}

export const POSITION_GENERATORS: Record<"power" | "counter_needed" | "playable" | "can_attack", (state: MatchState, catalog: Catalog, rng: Rng, prefer?: string) => Made | null> = {
  power: powerPuzzle,
  counter_needed: counterPuzzle,
  playable: playablePuzzle,
  can_attack: canAttackPuzzle,
};
