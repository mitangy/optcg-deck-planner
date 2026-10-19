import type { GameEvent, InstanceId, MatchState, Seat } from "./types.js";

/**
 * Why applying one intent (`before` -> `after`, emitting `events`) exposed
 * hidden information, as short player-facing text ("cards were drawn"), or
 * null when it exposed nothing. The undo menu shows it as the reason a rewind
 * is blocked (#536); `revealsHiddenInfo` is just "reason != null".
 *
 * Applying one intent (`before` -> `after`, emitting `events`) exposed
 * hidden information, so a rewind past it would let a player take back a peek
 * (#497). Covers: a card leaving a deck or Life zone, a Life card turned face
 * up, a `card_revealed` event that shows hidden info, and a new pending choice
 * that shows or points at hidden cards (Life triggers, looks and searches over
 * deck/Life, picks among the opponent's hand).
 *
 * Not reveals (#535): a choice over the chooser's own hand, field or trash
 * ("trash 1 card from your hand"), and a Character or trash card returning to
 * hand (its `card_revealed` event shows public info). A `card_revealed` counts
 * only when the card is the top of that seat's deck/Life (reveal_top) or a hand
 * card newly turned face up (`revealedHandIds` grew).
 *
 * The Draw Phase draw (`drew` with `turnDraw`) is exempt: it is forced, and deck
 * order plus the RNG are restored exactly by an undo, so the same card comes
 * back. Without the exemption an accidental "end turn" could never be undone.
 */
export function revealReason(before: MatchState, after: MatchState, events: readonly GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== "card_revealed") continue;
    if (revealedFromHiddenTop(before, after, e.seat, e.defId)) return "the top card of a deck or Life was revealed";
  }
  for (let seat = 0; seat < after.players.length; seat += 1) {
    const had = new Set(before.players[seat]?.revealedHandIds ?? []);
    if ((after.players[seat]!.revealedHandIds ?? []).some((id) => !had.has(id))) return "a hand card was revealed";
  }

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
    for (const id of b.zoneInstanceIds.deck) if (!deckAfter.has(id) && !turnDrawn.has(id)) return "cards were drawn from a deck";
    const lifeAfter = new Set(a.zoneInstanceIds.life);
    for (const id of b.zoneInstanceIds.life) if (!lifeAfter.has(id)) return "a Life card was taken";
    // A Life card staying in place but turning face up shows it to everyone.
    const faceUpBefore = new Map(b.zoneInstanceIds.life.map((id, i) => [id, b.faceUpLife[i] === true]));
    for (let i = 0; i < a.zoneInstanceIds.life.length; i += 1) {
      if (a.faceUpLife[i] === true && faceUpBefore.get(a.zoneInstanceIds.life[i]!) === false) return "a Life card was revealed";
    }
  }

  const knownChoices = new Set(before.pendingChoices.map((c) => c.id));
  const secret = new Set<InstanceId>();
  for (const p of after.players) for (const id of [...p.zoneInstanceIds.deck, ...p.zoneInstanceIds.life]) secret.add(id);
  for (const c of after.pendingChoices) {
    if (knownChoices.has(c.id)) continue;
    if (c.kind === "life_trigger") return "a Life trigger was revealed";
    for (const v of Object.values(c.bindings ?? {})) {
      if (typeof v !== "string") continue;
      if (secret.has(v)) return "a deck or Life card was looked at";
      for (let seat = 0; seat < after.players.length; seat += 1) {
        if (seat !== c.seat && after.players[seat]!.hand.some((c) => c.id === v)) return "a hand card was looked at";
      }
    }
    const options = c.request && "options" in c.request ? c.request.options : [];
    for (const o of options) {
      if (o.zone === "deck" || o.zone === "life") return "a deck or Life card was looked at";
      if (o.zone === "hand" && o.ownerSeat !== c.seat) return "a hand card was looked at";
    }
  }
  return null;
}

/** True when the intent exposed hidden information; see `revealReason`. */
export function revealsHiddenInfo(before: MatchState, after: MatchState, events: readonly GameEvent[]): boolean {
  return revealReason(before, after, events) !== null;
}

/** reveal_top shows the top card of a deck/Life zone; compare against both snapshots since the card may have moved. */
function revealedFromHiddenTop(before: MatchState, after: MatchState, seat: Seat, defId: string): boolean {
  for (const s of [before, after]) {
    const p = s.players[seat];
    if (p && (p.deck[0] === defId || p.life[0] === defId)) return true;
  }
  return false;
}
