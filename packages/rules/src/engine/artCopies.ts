/**
 * Only cards a deck may hold any number of (`deck_rule: any_number`) are ranked: a player can run several copies and
 * pick a different alternate art for each.
 */
import { abilitiesFor } from "../cards/abilities.js";
import type { InstanceId, MatchState, Seat } from "../types.js";

const anyNumberMemo = new Map<string, boolean>();

export function isAnyNumberCard(defId: string): boolean {
  let hit = anyNumberMemo.get(defId);
  if (hit === undefined) {
    hit = abilitiesFor(defId).some((a) => (a.statics ?? []).some((s) => s.s === "deck_rule" && s.rule === "any_number"));
    anyNumberMemo.set(defId, hit);
  }
  return hit;
}

/** Instance ids never change when a card moves, so a copy keeps its rank, and therefore its art, wherever it goes. */
export function artCopyIndex(state: MatchState, seat: Seat, opts: { publicOnly?: boolean; allHand?: boolean } = {}): ReadonlyMap<InstanceId, number> {
  const p = state.players[seat];
  const byDef = new Map<string, InstanceId[]>();
  const add = (defId: string, id: InstanceId) => {
    if (!isAnyNumberCard(defId)) return;
    const ids = byDef.get(defId);
    if (ids) ids.push(id);
    else byDef.set(defId, [id]);
  };
  if (opts.publicOnly) {
    const shown = p.revealedHandIds ?? [];
    for (const c of [...p.characters, ...(p.stage ? [p.stage] : []), ...p.resolving, ...p.hand.filter((c) => opts.allHand || shown.includes(c.id))]) add(c.defId, c.id);
    p.trash.forEach((defId, i) => add(defId, p.zoneInstanceIds.trash[i]!));
    p.life.forEach((defId, i) => {
      if (p.faceUpLife[i]) add(defId, p.zoneInstanceIds.life[i]!);
    });
  } else {
    for (const c of [...p.characters, ...(p.stage ? [p.stage] : []), ...p.hand, ...p.resolving]) add(c.defId, c.id);
    for (const zone of ["deck", "trash", "life"] as const) p[zone].forEach((defId, i) => add(defId, p.zoneInstanceIds[zone][i]!));
  }
  const out = new Map<InstanceId, number>();
  for (const ids of byDef.values()) ids.sort().forEach((id, rank) => out.set(id, rank));
  return out;
}

export function visibleArtCopies(state: MatchState, viewer: Seat | null, owner: Seat, allHand = false): ReadonlyMap<InstanceId, number> {
  return viewer === owner || state.winner !== null ? artCopyIndex(state, owner) : artCopyIndex(state, owner, { publicOnly: true, allHand });
}
