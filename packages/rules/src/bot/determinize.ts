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
 * The opponent's hidden pool is its true multiset of cards (the bot is assumed to know the opponent's 50 cards,
 * like a player who knows a meta deck), but never which of them are in hand, on top of the deck or in Life.
 */
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

/** A copy of `state` that is consistent with everything `seat` can see, with the hidden cards reshuffled. */
export function determinize(state: MatchState, seat: Seat, rng: Rng): MatchState {
  const copy = structuredClone(state) as MatchState;
  const pinned = pinnedIds(copy, seat);
  // Own hand is known; own deck and face-down Life are not. The opponent's hand is unknown too.
  reshuffle(slotsOf(copy.players[seat], pinned, { hand: false }), rng);
  reshuffle(slotsOf(copy.players[seat === 0 ? 1 : 0], pinned, { hand: true }), rng);
  // Events of the real game (private draws, hidden moves) must not travel with the copy, and the copy's own dice
  // must not replay the real game's future randomness.
  copy.lastEvents = [];
  copy.rng = { seed: rng.nextInt(0x7fffffff), cursor: 0 };
  return copy;
}
