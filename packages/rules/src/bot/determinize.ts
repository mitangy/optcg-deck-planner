/**
 * Determinization (#631): a copy of the match in which everything `seat` cannot see is resampled, so a search
 * that runs on the copy never uses hidden information.
 *
 * Hidden from `seat`: the order and identity of its own deck, its own face-down Life, and the opponent's hand,
 * deck and face-down Life. Each group is pooled, sorted (so the result depends only on WHAT is hidden, never on
 * where it currently sits) and reshuffled back into the same zone sizes. Instance ids and zone sizes never change,
 * only the card definition behind a hidden instance, so `applyIntent` and `assertInvariants` keep working.
 *
 * Kept as they are: face-up Life, cards an effect revealed from the opponent's hand, boards, trash, and every
 * hidden-zone card that one of `seat`'s own pending choices or resolving effects points at (those are cards the
 * seat is looking at right now, for example a search it is resolving).
 *
 * What the opponent's hidden slots are filled with (#635) depends on the `DeckPrior` passed in:
 *  - A prior with tournament lists for the opponent's Leader: one list is sampled (weighted), the cards the seat has
 *    already seen (board, Stage, trash, face-up Life, revealed hand, pinned cards) are subtracted from it, and the
 *    remainder deals out the hidden slots. If the opponent is not playing that list, seen cards the list lacks leave
 *    the remainder short and the shortfall is drawn from the generic pool below.
 *  - A prior with no list for that Leader: a generic pool, the cards of the Leader's colors that appear in the prior's
 *    lists (frequency-weighted, at most 4 of a card number in all), is sampled for the hidden slots.
 *  - No prior ("true"): the legacy behavior, the opponent's real hidden multiset is reshuffled (the bot is assumed to
 *    know the opponent's 50 cards). Only self-play experiments and old tests use it.
 * Either way the seat never learns WHICH hidden card is in hand, deck or Life: that is always resampled.
 */
import { getCardDef } from "../cards/definitions.js";
import type { Rng } from "../rng.js";
import type { InstanceId, MatchState, PendingChoice, PlayerState, ResolutionFrame, Seat } from "../types.js";

/** Every string that appears anywhere inside `value`. */
function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, into);
}

/** Instance ids the seat's own pending choices and resolving effects refer to (they stay as they are). */
function pinnedIds(state: MatchState, seat: Seat): Set<string> {
  const strings = new Set<string>();
  const mine = (c: PendingChoice): boolean => c.seat === seat || c.privateToSeat === seat;
  for (const c of state.pendingChoices) if (mine(c)) collectStrings(c, strings);
  for (const f of state.resolutionFrames as ResolutionFrame[]) if (f.seat === seat) collectStrings(f, strings);
  return strings;
}

/** Pool the definitions behind `slots`, shuffle them and deal them back out. */
function reshuffle(slots: { set(defId: string): void; defId: string }[], rng: Rng): void {
  const pool = slots.map((s) => s.defId).sort();
  const shuffled = rng.shuffle(pool);
  slots.forEach((s, i) => s.set(shuffled[i]!));
}

function slotsOf(p: PlayerState, pinned: Set<string>, opts: { hand: boolean }): { set(defId: string): void; defId: string }[] {
  const slots: { set(defId: string): void; defId: string }[] = [];
  p.deck.forEach((defId, i) => {
    if (!pinned.has(p.zoneInstanceIds.deck[i]!)) slots.push({ defId, set: (d) => { p.deck[i] = d; } });
  });
  p.life.forEach((defId, i) => {
    if (!p.faceUpLife[i] && !pinned.has(p.zoneInstanceIds.life[i]!)) slots.push({ defId, set: (d) => { p.life[i] = d; } });
  });
  if (opts.hand) {
    const revealed = new Set<InstanceId>(p.revealedHandIds ?? []);
    for (const card of p.hand) {
      if (revealed.has(card.id) || pinned.has(card.id)) continue;
      slots.push({ defId: card.defId, set: (d) => { card.defId = d; } });
    }
  }
  return slots;
}

/** Tournament lists (50 card ids each) by Leader id: what the bot assumes the opponent might be playing. */
export interface DeckPrior {
  lists: Record<string, string[][]>;
  /** Optional sampling weight per list (parallel to `lists[leader]`); equal weights when absent. */
  weights?: Record<string, number[]>;
}

/** `true`: use the opponent's real hidden multiset (legacy, for experiments). */
export type PriorChoice = DeckPrior | "true";

/** A prior from decklists, one list per entry (several entries with one Leader are several lists for it). */
export function buildDeckPrior(decks: readonly { leaderId: string; deck: readonly string[] }[]): DeckPrior {
  const lists: Record<string, string[][]> = {};
  for (const d of decks) (lists[d.leaderId] ??= []).push([...d.deck]);
  return { lists };
}

const genericCache = new WeakMap<DeckPrior, Map<string, string[]>>();

/** Every card number in the prior's lists that shares a color with the Leader, once per copy seen across all lists. */
function genericPool(prior: DeckPrior, leaderId: string): string[] {
  let byLeader = genericCache.get(prior);
  if (!byLeader) genericCache.set(prior, (byLeader = new Map()));
  const held = byLeader.get(leaderId);
  if (held) return held;
  let colors: string[] = [];
  try { colors = getCardDef(leaderId).colors; } catch { /* unknown leader: any color */ }
  const pool: string[] = [];
  for (const lists of Object.values(prior.lists)) {
    for (const list of lists) {
      for (const id of list) {
        try {
          const def = getCardDef(id);
          if (def.type === "leader") continue;
          if (colors.length && !def.colors.some((c) => colors.includes(c))) continue;
        } catch { continue; }
        pool.push(id);
      }
    }
  }
  pool.sort();
  byLeader.set(leaderId, pool);
  return pool;
}

const countOf = (ids: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

/** The defs behind `n` hidden opponent slots: the sampled list minus what is seen, topped up from the generic pool. */
function opponentPool(prior: DeckPrior, leaderId: string, seen: readonly string[], n: number, rng: Rng): string[] {
  const lists = prior.lists[leaderId] ?? [];
  const seenCount = countOf(seen);
  let remainder: string[] = [];
  if (lists.length) {
    const w = prior.weights?.[leaderId];
    let pick = 0;
    if (w && w.length === lists.length) {
      const total = w.reduce((a, b) => a + b, 0);
      let r = (rng.nextInt(1_000_000) / 1_000_000) * total;
      for (let i = 0; i < w.length; i += 1) { r -= w[i]!; if (r < 0) { pick = i; break; } pick = i; }
    } else pick = rng.nextInt(lists.length);
    const left = new Map(seenCount);
    for (const id of lists[pick]!) {
      const k = left.get(id) ?? 0;
      if (k > 0) left.set(id, k - 1);
      else remainder.push(id);
    }
  }
  remainder = rng.shuffle(remainder.sort()).slice(0, n);
  if (remainder.length < n) {
    // Short of cards: draw the rest from the Leader's generic pool, never past 4 copies of a number.
    const have = countOf([...seen, ...remainder]);
    const pool = rng.shuffle([...genericPool(prior, leaderId)]);
    for (const id of pool) {
      if (remainder.length >= n) break;
      const k = have.get(id) ?? 0;
      if (k >= 4) continue;
      have.set(id, k + 1);
      remainder.push(id);
    }
    // A prior too small to fill the slots: repeat what is there rather than fail.
    for (let i = 0; remainder.length < n && remainder.length > 0; i += 1) remainder.push(remainder[i % remainder.length]!);
  }
  return remainder;
}

/** Opponent cards `seat` knows about: everything outside the hidden slots (the Leader is not one of the 50). */
function seenCards(p: PlayerState, hiddenIds: Set<string>, pinned: Set<string>): string[] {
  const out: string[] = [];
  for (const c of p.characters) out.push(c.defId);
  if (p.stage) out.push(p.stage.defId);
  for (const c of p.resolving) out.push(c.defId);
  for (const d of p.trash) out.push(d);
  p.life.forEach((d, i) => { if (p.faceUpLife[i] || pinned.has(p.zoneInstanceIds.life[i]!)) out.push(d); });
  p.deck.forEach((d, i) => { if (pinned.has(p.zoneInstanceIds.deck[i]!)) out.push(d); });
  for (const c of p.hand) if (!hiddenIds.has(c.id)) out.push(c.defId);
  return out;
}

/** A copy of `state` that is consistent with everything `seat` can see, with the hidden cards reshuffled. */
export function determinize(state: MatchState, seat: Seat, rng: Rng, prior: PriorChoice = "true"): MatchState {
  const copy = structuredClone(state) as MatchState;
  const pinned = pinnedIds(copy, seat);
  // Own hand is known; own deck and face-down Life are not. The opponent's hand is unknown too.
  reshuffle(slotsOf(copy.players[seat], pinned, { hand: false }), rng);
  const oppSeat: Seat = seat === 0 ? 1 : 0;
  const oppSlots = slotsOf(copy.players[oppSeat], pinned, { hand: true });
  if (prior === "true") reshuffle(oppSlots, rng);
  else {
    const opp = copy.players[oppSeat];
    const revealed = new Set<InstanceId>(opp.revealedHandIds ?? []);
    const hiddenHand = new Set<string>(opp.hand.filter((c) => !revealed.has(c.id) && !pinned.has(c.id)).map((c) => c.id));
    const seen = seenCards(opp, hiddenHand, pinned);
    const pool = rng.shuffle(opponentPool(prior, opp.leader.defId, seen, oppSlots.length, rng));
    if (pool.length < oppSlots.length) reshuffle(oppSlots, rng);
    else oppSlots.forEach((s, i) => s.set(pool[i]!));
  }
  // Events of the real game (private draws, hidden moves) must not travel with the copy, and the copy's own dice
  // must not replay the real game's future randomness.
  copy.lastEvents = [];
  copy.rng = { seed: rng.nextInt(0x7fffffff), cursor: 0 };
  return copy;
}
