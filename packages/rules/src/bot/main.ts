/** Main phase: spend DON!! on plays, activate cheap abilities, power up attackers, attack, end the turn. */
import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { Intent } from "../types.js";
import type { Rng } from "../rng.js";
import type { BotView } from "./types.js";
import { boardValue, defValue, findBoardCard, isBlocker, pickBest, type BoardCard } from "./value.js";

/** What the bot has already done this turn (kept by the caller per rng), so it never loops on a repeatable ability. */
export interface TurnMemory { count: number; activated: Set<string> }

/** After this many bot intents in one turn the bot just ends it. */
export const MAX_INTENTS_PER_TURN = 60;

type Play = Extract<Intent, { type: "play_card" }>;
type Attack = Extract<Intent, { type: "declare_attack" }>;
type Give = Extract<Intent, { type: "give_don" }>;
type Activate = Extract<Intent, { type: "activate_ability" }>;

function myCard(view: BotView, id: string): BoardCard | undefined {
  return findBoardCard(view, id)?.card ?? (view.you.stage?.id === id ? view.you.stage : undefined);
}

/** Easy: a random legal move that still ends the turn, never wastes DON!! on a stage-sick board, and attacks only when sane. */
export function chooseEasyMain(view: BotView, rng: Rng, memory: TurnMemory): Intent {
  const legal = view.legalIntents;
  const end = legal.find((i) => i.type === "end_turn");
  if (end && memory.count >= 25) return end;
  const pool: Intent[] = [];
  for (const i of legal) {
    if (i.type === "end_turn") { pool.push(i, i); continue; }
    if (i.type === "give_don") { if (rng.next() < 0.15) pool.push(i); continue; }
    if (i.type === "activate_ability") { if (!memory.activated.has(`${i.sourceId}:${i.abilityId}`)) pool.push(i); continue; }
    pool.push(i);
  }
  return pool[rng.nextInt(pool.length)] ?? end ?? legal[0]!;
}

function abilityIsCheap(view: BotView, intent: Activate): boolean {
  const source = myCard(view, intent.sourceId);
  const ability = source && abilitiesFor(source.defId).find((a) => a.id === intent.abilityId);
  if (!ability) return false;
  // Free once-per-turn abilities, or ones priced in a single DON!! or in resting the source itself.
  return (ability.costs ?? []).every((c) => (c.k === "rest_don" && c.count <= 1) || c.k === "rest_self");
}

function chooseAbility(view: BotView, memory: TurnMemory, rng: Rng): Activate | undefined {
  const options = view.legalIntents.filter((i): i is Activate => i.type === "activate_ability" && !memory.activated.has(`${i.sourceId}:${i.abilityId}`) && abilityIsCheap(view, i));
  return pickBest(options, () => 0, rng);
}

/** Highest-value card that fits in the DON!! on hand; a full board only makes room for a clearly better card. */
function choosePlay(view: BotView, rng: Rng): Play | undefined {
  const plays = view.legalIntents.filter((i): i is Play => i.type === "play_card");
  const weakest = (id?: string) => (id ? view.you.characters.find((c) => c.id === id) : undefined);
  const score = (p: Play): number => {
    const card = view.you.hand[p.handIndex]!;
    const def = getCardDef(card.defId);
    let s = defValue(card.defId) + (card.playCost ?? def.cost) * 0.5;
    if (def.type === "event") s -= 1.5;
    if (p.trashCharacterId) {
      // Replacing a Character is only worth it when the new card is clearly better than the one lost.
      const lost = weakest(p.trashCharacterId);
      const gain = defValue(card.defId) - (lost ? boardValue(lost) : 0);
      if (gain < 3) return -Infinity;
      // Among replacements of the same new card, lose the cheapest Character.
      s -= (lost ? boardValue(lost) : 0) * 0.1;
    }
    // Every Character played also adds a blocker/attacker; cost-0 filler is not worth a hand card on a full board.
    return s;
  };
  const best = pickBest(plays, score, rng);
  return best && score(best) > -Infinity ? best : undefined;
}

function attacksOf(view: BotView): Attack[] {
  return view.legalIntents.filter((i): i is Attack => i.type === "declare_attack");
}

/** DON!! to attach so some attacker reaches the opposing Leader's power, or a spare DON!! onto the Leader. */
function chooseGive(view: BotView, rng: Rng): Give | undefined {
  const gives = view.legalIntents.filter((i): i is Give => i.type === "give_don");
  if (!gives.length) return undefined;
  const attacks = attacksOf(view);
  if (!attacks.length) return undefined;
  const oppLeader = view.opponent.leader.power;
  const active = view.you.activeDonCount;
  const attackers = new Map<string, BoardCard>();
  for (const a of attacks) {
    const card = myCard(view, a.attackerId);
    if (card) attackers.set(card.id, card);
  }
  const needs = [...attackers.values()]
    .map((c) => ({ c, need: Math.ceil((oppLeader - c.power) / 1000) }))
    .filter((x) => x.need > 0 && x.need <= active);
  const to = pickBest(needs, (x) => -x.need * 10 + (x.c.id === view.you.leader.id ? 1 : 0), rng);
  const give = (id: string) => gives.find((g) => g.targetId === id);
  if (to) return give(to.c.id);
  // Everything that can connect already does: pile spare DON!! on the Leader (keep what a hand Counter Event needs).
  let reserve = 0;
  for (const c of view.you.hand) {
    const def = getCardDef(c.defId);
    if (def.type === "event" && def.eventTiming === "counter") reserve = reserve === 0 ? def.cost : Math.min(reserve, def.cost);
  }
  if (active > reserve && attackers.has(view.you.leader.id) && view.you.leader.attachedDonCount < 4) return give(view.you.leader.id);
  return undefined;
}

function chooseAttack(view: BotView, rng: Rng): Attack | undefined {
  const oppLife = view.opponent.lifeCount;
  const leaderPower = view.opponent.leader.power;
  const scored: { a: Attack; score: number; power: number }[] = [];
  for (const a of attacksOf(view)) {
    const atk = myCard(view, a.attackerId);
    if (!atk) continue;
    // Keep Blockers home when my Life is low, unless this attack wins the game.
    const lethal = a.target.kind === "leader" && oppLife === 0 && atk.power >= leaderPower;
    if (!lethal && atk.id !== view.you.leader.id && isBlocker(atk) && view.you.lifeCount <= 2) continue;
    if (a.target.kind === "leader") {
      if (atk.power < leaderPower) continue;
      scored.push({ a, score: lethal ? 1000 : oppLife <= 2 ? 10 : 5, power: atk.power });
    } else {
      const targetId = a.target.instanceId;
      const target = view.opponent.characters.find((c) => c.id === targetId);
      if (!target || atk.power < target.power) continue;
      // Winning against a rested Character K.O.s it: worth more than a Life hit when it is a strong card.
      scored.push({ a, score: boardValue(target) + (oppLife >= 4 ? 1 : 0), power: atk.power });
    }
  }
  const best = pickBest(scored, (x) => x.score * 1000 - x.power / 1000, rng);
  return best?.a;
}

/** Normal-level main-phase move: always one of `view.legalIntents`. */
export function chooseNormalMain(view: BotView, rng: Rng, memory: TurnMemory): Intent {
  const legal = view.legalIntents;
  const end = legal.find((i) => i.type === "end_turn") ?? legal[0]!;
  if (memory.count >= MAX_INTENTS_PER_TURN) return end;
  return choosePlay(view, rng) ?? chooseAbility(view, memory, rng) ?? chooseGive(view, rng) ?? chooseAttack(view, rng) ?? end;
}
