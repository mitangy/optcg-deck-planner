/**
 * Fuzz-only invariants layered on top of `assertInvariants`: they need a
 * baseline from the start of the game or a second engine run, so they live
 * with the fuzzer rather than in the engine.
 */
import { applyIntent } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { deserializeMatch, serializeMatch } from "../state/snapshot.js";
import type { Intent, MatchState, PlayerState, Seat } from "../types.js";

/** Cards a seat owns across every zone (Leader included, attached DON!! excluded). */
export function countCards(p: PlayerState): number {
  return 1 + p.characters.length + (p.stage ? 1 : 0) + p.hand.length + p.resolving.length + p.deck.length + p.trash.length + p.life.length;
}

export function cardCounts(state: MatchState): [number, number] {
  return [countCards(state.players[0]), countCards(state.players[1])];
}

/**
 * Card instances stay in exactly one zone and nowhere else, per-seat totals
 * never change, and DON!! stays within 0..10 per zone with every attachment
 * pointing at a card that lists it.
 */
export function assertConservation(state: MatchState, baseline: [number, number]): void {
  const seenIds = new Set<string>();
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    const total = countCards(p);
    if (total !== baseline[seat]) throw new Error(`card count changed seat ${seat}: ${baseline[seat]} -> ${total}`);
    const ids = [p.leader.id, ...p.characters.map((c) => c.id), ...(p.stage ? [p.stage.id] : []), ...p.hand.map((c) => c.id), ...p.resolving.map((c) => c.id), ...p.zoneInstanceIds.deck, ...p.zoneInstanceIds.trash, ...p.zoneInstanceIds.life];
    for (const id of ids) {
      if (seenIds.has(id)) throw new Error(`card instance ${id} is in more than one zone (seat ${seat})`);
      seenIds.add(id);
    }
    const donIds = [...p.donDeck, ...p.costArea, ...p.attachedDons].map((d) => d.id);
    if (new Set(donIds).size !== donIds.length) throw new Error(`DON!! instance in two zones seat ${seat}`);
    for (const [zone, list] of [["don deck", p.donDeck], ["cost area", p.costArea], ["attached", p.attachedDons]] as const) {
      if (list.length > 10) throw new Error(`${zone} has ${list.length} DON!! seat ${seat}`);
    }
    const expected = p.donTotal ?? 10;
    if (donIds.length !== expected) throw new Error(`DON!! total ${donIds.length} != ${expected} seat ${seat}`);
    const holders = new Map<string, string>();
    for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])]) for (const id of c.attachedDonIds) holders.set(id, c.id);
    for (const d of p.attachedDons) if (d.attachedTo === null || holders.get(d.id) !== d.attachedTo) throw new Error(`DON!! ${d.id} attachedTo=${String(d.attachedTo)} but holder lists ${String(holders.get(d.id))} seat ${seat}`);
    for (const d of [...p.donDeck, ...p.costArea]) if (d.attachedTo !== null) throw new Error(`unattached DON!! ${d.id} has attachedTo seat ${seat}`);
  }
}

/**
 * Serializing and restoring the state mid-game must not change what happens
 * next: the same intent yields the same verdict, state and events.
 */
export function assertSnapshotContinues(state: MatchState, intent: Intent, seat: Seat): void {
  const restored = deserializeMatch(serializeMatch(state));
  const direct = applyIntent(state, intent, { seat, rng: createSeededRng(0) });
  const resumed = applyIntent(restored, intent, { seat, rng: createSeededRng(0) });
  if (direct.ok !== resumed.ok) throw new Error(`snapshot resume diverged: ok ${direct.ok} vs ${resumed.ok} for ${JSON.stringify(intent)}`);
  if (JSON.stringify(direct.state) !== JSON.stringify(resumed.state)) throw new Error(`snapshot resume diverged: state differs after ${JSON.stringify(intent)}`);
  if (JSON.stringify(direct.events) !== JSON.stringify(resumed.events)) throw new Error(`snapshot resume diverged: events differ after ${JSON.stringify(intent)}`);
}
