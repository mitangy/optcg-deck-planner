import type { GameEvent, InstanceId, MatchState } from "./types.js";

/**
 * True when applying one intent (`before` -> `after`, emitting `events`) exposed
 * hidden information, so a rewind past it would let a player take back a peek
 * (#497). Covers: a card leaving a deck or Life zone, a Life card turned face
 * up, a `card_revealed` event, and a new pending choice that is private to one
 * seat or points at deck/Life cards (looks, searches, Life checks).
 *
 * The Draw Phase draw (`drew` with `turnDraw`) is exempt: it is forced, and deck
 * order plus the RNG are restored exactly by an undo, so the same card comes
 * back. Without the exemption an accidental "end turn" could never be undone.
 */
export function revealsHiddenInfo(before: MatchState, after: MatchState, events: readonly GameEvent[]): boolean {
  if (events.some((e) => e.type === "card_revealed")) return true;

  const turnDrawn = new Set<InstanceId>();
  for (const e of events) {
    if (e.type === "drew" && e.turnDraw) {
      // The drawn card is the one that left the top (front) of that seat's deck.
      const top = before.players[e.seat].zoneInstanceIds.deck.slice(0, e.count);
      for (const id of top) turnDrawn.add(id);
    }
  }

  for (let seat = 0; seat < before.players.length; seat += 1) {
    const b = before.players[seat]!;
    const a = after.players[seat]!;
    const deckAfter = new Set(a.zoneInstanceIds.deck);
    for (const id of b.zoneInstanceIds.deck) if (!deckAfter.has(id) && !turnDrawn.has(id)) return true;
    const lifeAfter = new Set(a.zoneInstanceIds.life);
    for (const id of b.zoneInstanceIds.life) if (!lifeAfter.has(id)) return true;
    // A Life card staying in place but turning face up shows it to everyone.
    const faceUpBefore = new Map(b.zoneInstanceIds.life.map((id, i) => [id, b.faceUpLife[i] === true]));
    for (let i = 0; i < a.zoneInstanceIds.life.length; i += 1) {
      if (a.faceUpLife[i] === true && faceUpBefore.get(a.zoneInstanceIds.life[i]!) === false) return true;
    }
  }

  const knownChoices = new Set(before.pendingChoices.map((c) => c.id));
  const secret = new Set<InstanceId>();
  for (const p of after.players) for (const id of [...p.zoneInstanceIds.deck, ...p.zoneInstanceIds.life]) secret.add(id);
  for (const c of after.pendingChoices) {
    if (knownChoices.has(c.id)) continue;
    if (c.privateToSeat != null) return true;
    if (c.bindings && Object.values(c.bindings).some((v) => typeof v === "string" && secret.has(v))) return true;
  }
  return false;
}
