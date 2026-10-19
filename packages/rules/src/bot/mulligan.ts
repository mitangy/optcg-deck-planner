import { getCardDef } from "../cards/definitions.js";
import type { Intent, MatchState, Seat } from "../types.js";
import type { Rng } from "../rng.js";
import type { BotLevel, BotView } from "./types.js";

/** Keep a hand with a playable curve: at least two Characters costing 4 or less. Easy keeps unless the rng says otherwise. */
export function chooseMulligan(view: BotView, level: BotLevel, rng: Rng): Intent {
  const legal = view.legalIntents;
  const mull = legal.find((i) => i.type === "mulligan" && i.doMulligan);
  const keep = legal.find((i) => i.type === "mulligan" && !i.doMulligan);
  if (!mull || !keep) return legal[0]!;
  if (level === "easy") return rng.next() < 0.25 ? mull : keep;
  const cheap = view.you.hand.filter((c) => {
    const def = getCardDef(c.defId);
    return def.type === "character" && def.cost <= 4;
  }).length;
  return cheap >= 2 ? keep : mull;
}

// --- Hard: keep or mulligan by simulation (#635) ---------------------------------------------------------------------

/** How many hypothetical redraws / futures each side of the comparison is averaged over. */
export const MULLIGAN_SAMPLES = 80;
/** Turns of the abstract goldfish. */
const GOLDFISH_TURNS = 4;
/** Mulligan only when the redraw is clearly better: a kept hand is known to be real, a redraw is a gamble. */
export const MULLIGAN_MARGIN = 0.03;

/**
 * How well a hand uses its DON!! over the first turns, 0..~1.2: each of turns 1-4 earns the share of that turn's DON!!
 * spent on cards from the hand (greedy, most expensive first, Characters, Stages and Events alike), plus a little for
 * the first Counters (they do not need DON!! but they hold the early Life). `draws` is the order of the cards drawn
 * after this hand. The first player skips its first draw and gets 1 DON!! on turn 1, then both get 2 per turn.
 */
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

/** Keep or mulligan: the hand against sampled redraws, scored by `goldfishScore` over sampled futures. Returns one of the legal mulligan intents. */
export function chooseSimMulligan(state: MatchState, seat: Seat, view: BotView, rng: Rng, base: Intent): Intent {
  const mull = view.legalIntents.find((i) => i.type === "mulligan" && i.doMulligan);
  const keep = view.legalIntents.find((i) => i.type === "mulligan" && !i.doMulligan);
  if (!mull || !keep) return base;
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
