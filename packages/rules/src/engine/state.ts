/**
 * State helpers: identity allocation, card location and zone movement.
 * Every card keeps its instance id across zones; deck/trash/life keep parallel
 * definition and identity arrays.
 */
import { getCardDef } from "../cards/definitions.js";
import type { CardDefId, CardInstance, DonInstance, GameEvent, InstanceId, MatchState, PlayerState, Seat } from "../types.js";

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function alloc(state: MatchState, prefix: string): string {
  const id = `${prefix}_${state.nextId}`;
  state.nextId += 1;
  return id;
}

export function makeCard(defId: CardDefId, id: InstanceId): CardInstance {
  return { id, defId, rested: false, attachedDonIds: [] };
}

export function makeDon(state: MatchState): DonInstance {
  return { id: alloc(state, "don"), rested: false, attachedTo: null };
}

export type ZoneName = "leader" | "character" | "stage" | "hand" | "deck" | "trash" | "life" | "resolving";

export interface Located {
  seat: Seat;
  zone: ZoneName;
  index: number;
  id: InstanceId;
  defId: CardDefId;
  card?: CardInstance;
}

export function fieldCards(player: PlayerState): CardInstance[] {
  return [player.leader, ...player.characters, ...(player.stage ? [player.stage] : [])];
}

export function locate(state: MatchState, id: InstanceId): Located | null {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    if (p.leader.id === id) return { seat, zone: "leader", index: 0, id, defId: p.leader.defId, card: p.leader };
    let index = p.characters.findIndex((c) => c.id === id);
    if (index >= 0) return { seat, zone: "character", index, id, defId: p.characters[index]!.defId, card: p.characters[index] };
    if (p.stage?.id === id) return { seat, zone: "stage", index: 0, id, defId: p.stage.defId, card: p.stage };
    index = p.hand.findIndex((c) => c.id === id);
    if (index >= 0) return { seat, zone: "hand", index, id, defId: p.hand[index]!.defId, card: p.hand[index] };
    index = p.resolving.findIndex((c) => c.id === id);
    if (index >= 0) return { seat, zone: "resolving", index, id, defId: p.resolving[index]!.defId, card: p.resolving[index] };
    for (const zone of ["deck", "trash", "life"] as const) {
      index = p.zoneInstanceIds[zone].indexOf(id);
      if (index >= 0) return { seat, zone, index, id, defId: p[zone][index]! };
    }
  }
  return null;
}

export function isOnField(loc: Located | null): boolean {
  return loc != null && (loc.zone === "leader" || loc.zone === "character" || loc.zone === "stage");
}

/** Board card (Leader/Character/Stage) by id for a seat. */
export function findField(player: PlayerState, id: InstanceId): CardInstance | null {
  if (player.leader.id === id) return player.leader;
  if (player.stage?.id === id) return player.stage;
  return player.characters.find((c) => c.id === id) ?? null;
}

/** Return every DON!! attached to a card to its owner's cost area, rested. */
export function returnAttachedDon(player: PlayerState, card: CardInstance): void {
  const ids = [...card.attachedDonIds];
  card.attachedDonIds = [];
  for (const id of ids) {
    const idx = player.attachedDons.findIndex((d) => d.id === id);
    if (idx < 0) continue;
    const [don] = player.attachedDons.splice(idx, 1);
    don!.attachedTo = null;
    don!.rested = true;
    player.costArea.push(don!);
  }
}

/** Remove a card from wherever it is. Field cards lose DON!!, modifiers and per-instance state. */
export function takeCard(state: MatchState, loc: Located): { id: InstanceId; defId: CardDefId } {
  const p = state.players[loc.seat];
  switch (loc.zone) {
    case "leader":
      throw new Error("The Leader cannot leave the field");
    case "character": {
      const [card] = p.characters.splice(loc.index, 1);
      returnAttachedDon(p, card!);
      break;
    }
    case "stage":
      returnAttachedDon(p, p.stage!);
      p.stage = null;
      break;
    case "hand":
      p.hand.splice(loc.index, 1);
      // A card that leaves the hand is no longer revealed, even if it returns later (#491).
      if (p.revealedHandIds) p.revealedHandIds = p.revealedHandIds.filter((id) => id !== loc.id);
      break;
    case "resolving":
      p.resolving.splice(loc.index, 1);
      break;
    case "deck": case "trash": case "life":
      p[loc.zone].splice(loc.index, 1);
      p.zoneInstanceIds[loc.zone].splice(loc.index, 1);
      if (loc.zone === "life") p.faceUpLife.splice(loc.index, 1);
      break;
  }
  if (loc.zone === "character" || loc.zone === "stage") state.modifiers = state.modifiers.filter((m) => !(m.target.kind === "card" && m.target.id === loc.id));
  return { id: loc.id, defId: loc.defId };
}

export type Position = "top" | "bottom";

/** Put a card into a non-field zone of its owner. Deck/Life index 0 is the top. */
export function putCard(state: MatchState, seat: Seat, zone: "hand" | "deck" | "trash" | "life" | "resolving", entry: { id: InstanceId; defId: CardDefId }, opts: { position?: Position; faceUp?: boolean } = {}): void {
  const p = state.players[seat];
  if (zone === "hand") { p.hand.push(makeCard(entry.defId, entry.id)); return; }
  if (zone === "resolving") { p.resolving.push(makeCard(entry.defId, entry.id)); return; }
  const top = opts.position === "top" || (opts.position == null && zone === "life");
  if (zone === "trash") { p.trash.push(entry.defId); p.zoneInstanceIds.trash.push(entry.id); return; }
  if (top) {
    p[zone].unshift(entry.defId);
    p.zoneInstanceIds[zone].unshift(entry.id);
    if (zone === "life") p.faceUpLife.unshift(Boolean(opts.faceUp));
  } else {
    p[zone].push(entry.defId);
    p.zoneInstanceIds[zone].push(entry.id);
    if (zone === "life") p.faceUpLife.push(Boolean(opts.faceUp));
  }
}

/** Put a card onto the field as a Character or Stage. Returns the new board card. */
export function putOnField(state: MatchState, seat: Seat, entry: { id: InstanceId; defId: CardDefId }, opts: { rested?: boolean } = {}, events: GameEvent[]): CardInstance {
  const p = state.players[seat];
  const def = getCardDef(entry.defId);
  const card: CardInstance = { ...makeCard(entry.defId, entry.id), rested: Boolean(opts.rested), playedTurn: state.turnNumber };
  if (def.type === "stage") {
    if (p.stage) {
      const old = p.stage;
      takeCard(state, { seat, zone: "stage", index: 0, id: old.id, defId: old.defId, card: old });
      putCard(state, seat, "trash", old);
      events.push({ type: "stage_replaced", seat, trashedDefId: old.defId });
    }
    p.stage = card;
  } else {
    card.summoningSick = true;
    p.characters.push(card);
  }
  return card;
}

export function drawCards(state: MatchState, seat: Seat, count: number, events: GameEvent[]): number {
  const p = state.players[seat];
  let drawn = 0;
  for (let i = 0; i < count && p.deck.length > 0; i += 1) {
    const defId = p.deck.shift()!;
    const id = p.zoneInstanceIds.deck.shift()!;
    p.hand.push(makeCard(defId, id));
    drawn += 1;
  }
  if (drawn > 0) events.push({ type: "drew", seat, count: drawn });
  return drawn;
}

export function activeDon(p: PlayerState): DonInstance[] {
  return p.costArea.filter((d) => !d.rested);
}

export function donOnField(p: PlayerState): number {
  return p.costArea.length + p.attachedDons.length;
}

export function placeDonFromDeck(p: PlayerState, count: number, rested: boolean): number {
  let placed = 0;
  while (placed < count && p.donDeck.length > 0) {
    const d = p.donDeck.shift()!;
    d.rested = rested;
    d.attachedTo = null;
    p.costArea.push(d);
    placed += 1;
  }
  return placed;
}

/** Return DON!! from the field to the DON!! deck, least valuable first. */
export function returnDonToDeck(state: MatchState, seat: Seat, count: number, activeOnly = false): number {
  const p = state.players[seat];
  let returned = 0;
  const take = (predicate: (d: DonInstance) => boolean) => {
    while (returned < count) {
      const idx = p.costArea.findIndex(predicate);
      if (idx < 0) return;
      const [d] = p.costArea.splice(idx, 1);
      d!.rested = false;
      p.donDeck.push(d!);
      returned += 1;
    }
  };
  if (!activeOnly) take((d) => d.rested);
  take((d) => !d.rested);
  if (activeOnly) return returned;
  take(() => true);
  while (returned < count && p.attachedDons.length > 0) {
    const d = p.attachedDons.pop()!;
    for (const card of fieldCards(p)) card.attachedDonIds = card.attachedDonIds.filter((id) => id !== d.id);
    d.attachedTo = null;
    d.rested = false;
    p.donDeck.push(d);
    returned += 1;
  }
  void state;
  return returned;
}

export function attachDon(state: MatchState, seat: Seat, target: CardInstance, donState: "rested" | "active" | "any"): DonInstance | null {
  const p = state.players[seat];
  // "Give DON!!" without a state prefers rested DON!!, keeping active DON!! payable.
  const restedIdx = p.costArea.findIndex((d) => d.rested);
  const activeIdx = p.costArea.findIndex((d) => !d.rested);
  const chosen = donState === "rested" ? restedIdx : donState === "active" ? activeIdx : restedIdx >= 0 ? restedIdx : activeIdx;
  if (chosen < 0) return null;
  const [don] = p.costArea.splice(chosen, 1);
  don!.attachedTo = target.id;
  target.attachedDonIds.push(don!.id);
  p.attachedDons.push(don!);
  return don!;
}

/** Return one specific cost-area DON!! to its owner's DON!! deck. */
export function returnDonById(state: MatchState, seat: Seat, donId: string): boolean {
  const p = state.players[seat];
  const idx = p.costArea.findIndex((d) => d.id === donId);
  if (idx >= 0) {
    const [d] = p.costArea.splice(idx, 1);
    d!.rested = false;
    p.donDeck.push(d!);
    return true;
  }
  // DON!! attached to a Leader / Character (still "on your field").
  const aIdx = p.attachedDons.findIndex((d) => d.id === donId);
  if (aIdx < 0) return false;
  const [d] = p.attachedDons.splice(aIdx, 1);
  for (const card of fieldCards(p)) card.attachedDonIds = card.attachedDonIds.filter((id) => id !== donId);
  d!.attachedTo = null;
  d!.rested = false;
  p.donDeck.push(d!);
  return true;
}
