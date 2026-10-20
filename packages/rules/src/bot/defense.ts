/** Block and counter steps: the bot is the defender. */
import { getCardDef } from "../cards/definitions.js";
import type { Intent } from "../types.js";
import type { Rng } from "../rng.js";
import type { BotLevel, BotView } from "./types.js";
import { boardValue, defValue, findBoardCard, type BoardCard } from "./value.js";

type CounterOption = { intent: Intent; boost: number; cost: number; don: number };

/** How much stopping this hit is worth, in the same points as `defValue`. */
function hitValue(view: BotView, target: BoardCard, onLeader: boolean, dmg: number): number {
  if (!onLeader) return boardValue(target);
  const life = view.you.lifeCount;
  if (life === 0) return 1000;
  if (life - dmg <= 0) return 12;
  if (life <= 2) return 4 * dmg;
  return (life === 3 ? 1.6 : 0.8) * dmg;
}

/** Power an Event's [Counter] gives, read from its printed text ("+2000 power"); 0 when it is not a plain boost. */
function eventBoost(defId: string): number {
  const m = /\+(\d+)\s*power/i.exec(getCardDef(defId).effectText ?? "");
  return m ? Number(m[1]) : 0;
}

function counterOptions(view: BotView): CounterOption[] {
  const out: CounterOption[] = [];
  for (const intent of view.legalIntents) {
    if (intent.type !== "counter_from_hand" && intent.type !== "counter_event") continue;
    const row = view.you.hand[intent.handIndex];
    if (!row) continue;
    const keep = 1 + defValue(row.defId) * 0.3;
    if (intent.type === "counter_from_hand") out.push({ intent, boost: row.counter ?? 0, cost: keep, don: 0 });
    else {
      const boost = eventBoost(row.defId);
      if (boost > 0) out.push({ intent, boost, cost: keep, don: getCardDef(row.defId).cost });
    }
  }
  return out.filter((o) => o.boost > 0);
}

/** Cheapest set of counters (by cards spent) whose boost reaches `need`; null when none does. */
function cheapestCounters(options: CounterOption[], need: number, donAvailable: number): CounterOption[] | null {
  const pool = [...options].sort((a, b) => b.boost / b.cost - a.boost / a.cost).slice(0, 12);
  let best: CounterOption[] | null = null;
  let bestCost = Infinity;
  for (let mask = 1; mask < 1 << pool.length; mask += 1) {
    const set = pool.filter((_, i) => mask & (1 << i));
    const boost = set.reduce((n, o) => n + o.boost, 0);
    if (boost < need || set.reduce((n, o) => n + o.don, 0) > donAvailable) continue;
    // Overshoot wastes cards: charge a little for every spare 1000.
    const cost = set.reduce((n, o) => n + o.cost, 0) + (boost - need) / 1000 * 0.3;
    if (cost < bestCost) { best = set; bestCost = cost; }
  }
  return best;
}

export function chooseDefense(view: BotView, level: BotLevel, rng: Rng): Intent {
  const legal = view.legalIntents;
  const pass = legal.find((i) => i.type === "pass_block" || i.type === "pass_counter") ?? legal[0]!;
  const battle = view.battle;
  if (!battle) return pass;
  const attacker = findBoardCard(view, battle.attackerId)?.card;
  const target = battle.target.kind === "leader" ? view.you.leader : view.you.characters.find((c) => c.id === (battle.target as { instanceId: string }).instanceId);
  if (!attacker || !target) return pass;
  const onLeader = battle.target.kind === "leader";
  const dmg = attacker.keywords.includes("double_attack") ? 2 : 1;
  const connects = attacker.power >= target.power;
  if (!connects) return pass;
  const worth = hitValue(view, target, onLeader, dmg);

  if (view.phase === "block") {
    if (level === "easy") {
      const blocks = legal.filter((i) => i.type === "declare_block");
      return worth >= 4 && blocks.length && rng.next() < 0.5 ? blocks[rng.nextInt(blocks.length)]! : pass;
    }
    let best: Intent = pass;
    let bestGain = 0;
    for (const intent of legal) {
      if (intent.type !== "declare_block") continue;
      const blocker = view.you.characters.find((c) => c.id === intent.blockerId);
      if (!blocker) continue;
      // A blocker that out-powers the attacker survives for free; otherwise it is the price of the block.
      const price = blocker.power > attacker.power ? 0 : boardValue(blocker);
      const gain = worth - price;
      if (gain > bestGain) { best = intent; bestGain = gain; }
    }
    return best;
  }

  // Counter step: spend the fewest cards that win the battle, and only when the hit is worth it.
  const options = counterOptions(view);
  if (!options.length) return pass;
  const need = attacker.power - target.power + 1;
  const set = cheapestCounters(options, need, view.you.activeDonCount);
  if (!set) return pass;
  const price = set.reduce((n, o) => n + o.cost, 0);
  if (level === "easy") return worth >= 12 && rng.next() < 0.5 ? set[0]!.intent : pass;
  if (worth <= price) return pass;
  // Cards first, then Events (they also tap DON!!).
  return [...set].sort((a, b) => a.don - b.don)[0]!.intent;
}
