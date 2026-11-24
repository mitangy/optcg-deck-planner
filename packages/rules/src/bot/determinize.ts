/**
 * Each hidden group is pooled and sorted so the result depends only on WHAT is hidden, never on where it sits.
 * Hidden-zone cards that one of `seat`'s own pending choices or resolving effects point at stay as they are: the seat
 * is looking at them.
 */
import { getCardDef } from "../cards/definitions.js";
import type { Rng } from "../rng.js";
import type { InstanceId, MatchState, PendingChoice, PlayerState, ResolutionFrame, Seat } from "../types.js";

function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, into);
}

function pinnedIds(state: MatchState, seat: Seat): Set<string> {
  const strings = new Set<string>();
  const mine = (c: PendingChoice): boolean => c.seat === seat || c.privateToSeat === seat;
  for (const c of state.pendingChoices) if (mine(c)) collectStrings(c, strings);
  for (const f of state.resolutionFrames as ResolutionFrame[]) if (f.seat === seat) collectStrings(f, strings);
  return strings;
}

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

export interface DeckPrior {
  lists: Record<string, string[][]>;
  weights?: Record<string, number[]>;
}

export type PriorChoice = DeckPrior | "true";

export function buildDeckPrior(decks: readonly { leaderId: string; deck: readonly string[] }[]): DeckPrior {
  const lists: Record<string, string[][]> = {};
  for (const d of decks) (lists[d.leaderId] ??= []).push([...d.deck]);
  return { lists };
}

const genericCache = new WeakMap<DeckPrior, Map<string, string[]>>();

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

export function determinize(state: MatchState, seat: Seat, rng: Rng, prior: PriorChoice = "true"): MatchState {
  const copy = structuredClone(state) as MatchState;
  const pinned = pinnedIds(copy, seat);
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
