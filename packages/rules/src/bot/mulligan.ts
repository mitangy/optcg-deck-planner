import { getCardDef } from "../cards/definitions.js";
import type { Intent, MatchState, Seat } from "../types.js";
import type { Rng } from "../rng.js";
import type { LeaderPlaybook } from "./playbooks/types.js";
import type { BotLevel, BotView } from "./types.js";

export function chooseMulligan(view: BotView, level: BotLevel, rng: Rng, pb?: LeaderPlaybook): Intent {
  const legal = view.legalIntents;
  const mull = legal.find((i) => i.type === "mulligan" && i.doMulligan);
  const keep = legal.find((i) => i.type === "mulligan" && !i.doMulligan);
  if (!mull || !keep) return legal[0]!;
  if (level === "easy") return rng.next() < 0.25 ? mull : keep;
  const verdict = pb?.mulligan?.(view.you.hand.map((c) => c.defId), view.firstSeat === view.seat);
  if (verdict) return verdict === "keep" ? keep : mull;
  const cheap = view.you.hand.filter((c) => {
    const def = getCardDef(c.defId);
    return def.type === "character" && def.cost <= 4;
  }).length;
  return cheap >= 2 ? keep : mull;
}

export const MULLIGAN_SAMPLES = 80;
const GOLDFISH_TURNS = 4;
/** Mulligan only when the redraw is clearly better: a kept hand is known to be real, a redraw is a gamble. */
export const MULLIGAN_MARGIN = 0.03;

export function goldfishScore(hand: readonly string[], draws: readonly string[], first: boolean): number {
  const held = hand.map((id) => {
    const def = getCardDef(id);
    return { cost: def.cost, counter: def.type === "character" ? (def.counter ?? 0) : 0, playable: def.type !== "leader" };
  });
  let drawIndex = 0;
  let score = 0;
  for (let t = 1; t <= GOLDFISH_TURNS; t += 1) {
    if (!(first && t === 1) && drawIndex < draws.length) {
      const def = getCardDef(draws[drawIndex]!);
      held.push({ cost: def.cost, counter: def.type === "character" ? (def.counter ?? 0) : 0, playable: def.type !== "leader" });
      drawIndex += 1;
    }
    const don = first ? 2 * t - 1 : 2 * t;
    let left = don;
    held.sort((a, b) => b.cost - a.cost);
    for (let i = 0; i < held.length; i += 1) {
      const c = held[i]!;
      if (c.playable && c.cost > 0 && c.cost <= left) { left -= c.cost; held.splice(i, 1); i -= 1; }
    }
    score += (don - left) / don;
  }
  const counters = held.filter((c) => c.counter > 0).length;
  return score / GOLDFISH_TURNS + 0.06 * Math.min(2, counters);
}

export function chooseSimMulligan(state: MatchState, seat: Seat, view: BotView, rng: Rng, base: Intent, pb?: LeaderPlaybook): Intent {
  const mull = view.legalIntents.find((i) => i.type === "mulligan" && i.doMulligan);
  const keep = view.legalIntents.find((i) => i.type === "mulligan" && !i.doMulligan);
  if (!mull || !keep) return base;
  const verdict = pb?.mulligan?.(view.you.hand.map((c) => c.defId), state.firstSeat === seat);
  if (verdict) return verdict === "keep" ? keep : mull;
  const me = state.players[seat];
  // Unknown to the bot: the order of its deck and which of the remaining cards sit in Life. Known: the multiset.
  const rest = [...me.deck, ...me.life];
  const hand = view.you.hand.map((c) => c.defId);
  const first = state.firstSeat === seat;
  let keepScore = 0;
  let mullScore = 0;
  for (let k = 0; k < MULLIGAN_SAMPLES; k += 1) {
    const kept = rng.shuffle([...rest]);
    keepScore += goldfishScore(hand, kept, first);
    const all = rng.shuffle([...rest, ...hand]);
    mullScore += goldfishScore(all.slice(0, hand.length), all.slice(hand.length), first);
  }
  return mullScore / MULLIGAN_SAMPLES > keepScore / MULLIGAN_SAMPLES + MULLIGAN_MARGIN ? mull : keep;
}
