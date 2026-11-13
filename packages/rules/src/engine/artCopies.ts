/**
 * Which copy of a card an instance is, so clients can show "One of each art" (#1292).
 * Only cards a deck may hold any number of (`deck_rule: any_number`) are ranked: for them a player
 * can run several copies and pick a different alternate art for each.
 */
import { abilitiesFor } from "../cards/abilities.js";
import type { InstanceId, MatchState, Seat } from "../types.js";

const anyNumberMemo = new Map<string, boolean>();

/** True for a card whose text lets a deck hold any number of copies. */
export function isAnyNumberCard(defId: string): boolean {
  let hit = anyNumberMemo.get(defId);
  if (hit === undefined) {
    hit = abilitiesFor(defId).some((a) => (a.statics ?? []).some((s) => s.s === "deck_rule" && s.rule === "any_number"));
    anyNumberMemo.set(defId, hit);
  }
  return hit;
}

/**
 * 0-based rank of each any-number card instance among the seat's copies of the same card, across every zone
 * (hidden deck, Life and trash included) ordered by instance id. Instance ids never change when a card moves,
 * so a copy keeps its rank, and therefore its art, wherever it goes. Empty for decks without such cards.
 */
export function artCopyIndex(state: MatchState, seat: Seat): ReadonlyMap<InstanceId, number> {
  const p = state.players[seat];
  const byDef = new Map<string, InstanceId[]>();
  const add = (defId: string, id: InstanceId) => {
    if (!isAnyNumberCard(defId)) return;
    const ids = byDef.get(defId);
    if (ids) ids.push(id);
    else byDef.set(defId, [id]);
  };
  for (const c of [...p.characters, ...(p.stage ? [p.stage] : []), ...p.hand, ...p.resolving]) add(c.defId, c.id);
  for (const zone of ["deck", "trash", "life"] as const) p[zone].forEach((defId, i) => add(defId, p.zoneInstanceIds[zone][i]!));
  const out = new Map<InstanceId, number>();
  for (const ids of byDef.values()) ids.sort().forEach((id, rank) => out.set(id, rank));
  return out;
}
