import type { GameEvent, MatchState, Seat } from "@optcg/rules";
import type { ArtPrefsMap } from "./protocol.js";

// Alt-art prefs are keyed by card defId, so relaying a whole map names every card in the owner's deck.

// A card that was seen and went back to hand stays public (`into` accumulates).
export function collectPublicDefIds(
  state: MatchState,
  seat: Seat,
  events: readonly GameEvent[],
  into: Set<string> = new Set(),
): Set<string> {
  const p = state.players[seat];
  into.add(p.leader.defId);
  for (const c of p.characters) into.add(c.defId);
  if (p.stage) into.add(p.stage.defId);
  for (const defId of p.trash) into.add(defId);
  p.life.forEach((defId, i) => {
    if (p.faceUpLife[i]) into.add(defId);
  });
  for (const c of p.resolving) into.add(c.defId);
  // Cards that were shown and then left the table (bounced, shuffled back, revealed from hand or deck).
  for (const e of events) {
    switch (e.type) {
      case "card_played":
      case "character_ko":
      case "stage_trashed":
      case "counter_applied":
      case "card_revealed":
        if (e.seat === seat) into.add(e.defId);
        break;
      case "stage_replaced":
        if (e.seat === seat) into.add(e.trashedDefId);
        break;
      case "card_moved":
        if (e.seat === seat && !e.hidden) into.add(e.defId);
        break;
    }
  }
  return into;
}

export function visibleArtPrefs(prefs: ArtPrefsMap, publicDefIds: ReadonlySet<string>): ArtPrefsMap {
  const out: ArtPrefsMap = {};
  for (const [defId, altId] of Object.entries(prefs)) {
    if (publicDefIds.has(defId)) out[defId] = altId;
  }
  return out;
}
