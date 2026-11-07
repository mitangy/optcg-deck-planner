/**
 * DON!! pseudo-locations (cost area / attached DON!!) addressable like cards.
 */
import type { MatchState, Seat } from "../types.js";
import { type Located, fieldCards } from "./state.js";
import { nameOf } from "./sim.js";

/** A DON!! card (cost area, or attached to a card) as a pseudo-location (zone "don"). */
export function locateDon(state: MatchState, id: string): Located | null {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    const index = p.costArea.findIndex((d) => d.id === id);
    if (index >= 0) return { seat, zone: "don", index, id, defId: "DON" };
    const aIdx = p.attachedDons.findIndex((d) => d.id === id);
    if (aIdx >= 0) return { seat, zone: "don", index: p.costArea.length + aIdx, id, defId: "DON" };
  }
  return null;
}

/** Where a DON!! option sits, so prompts can tell otherwise-identical DON!! apart. */
export function donOptionInfo(state: MatchState, loc: Located): { label: string; rested: boolean } {
  const p = state.players[loc.seat];
  const cost = p.costArea.find((d) => d.id === loc.id);
  if (cost) return { label: cost.rested ? "Rested DON!!" : "Active DON!!", rested: cost.rested };
  const attached = p.attachedDons.find((d) => d.id === loc.id);
  const host = attached?.attachedTo ? fieldCards(p).find((c) => c.id === attached.attachedTo) : null;
  return { label: host ? `DON!! on ${nameOf(host.defId)}` : "Attached DON!!", rested: false };
}
