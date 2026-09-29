import type { PlayerView } from "../net/protocol";
import { battleEndpoints } from "./battleArc";

type BoardCard = { id: string; defId: string; power?: number };

function findCard(view: PlayerView, id: string): BoardCard | null {
  for (const side of ["you", "opponent"] as const) {
    const p = view[side];
    if (p.leader.id === id) return p.leader;
    const c = p.characters.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

/**
 * Midline banner for the current battle: "Battle: Attacker (power) → Target (power)".
 * The target comes from `battleEndpoints`, so a Leader target is the defending
 * seat's Leader whichever side attacks, and a Blocker replaces the target.
 */
export function describeBattle(view: PlayerView, nameOf: (defId: string) => string): string {
  const b = view.battle as { attackerId?: unknown } | null;
  if (!b) return "";
  const ends = battleEndpoints(view);
  const atk = findCard(view, ends?.attackerId ?? String(b.attackerId ?? ""));
  const def = ends ? findCard(view, ends.targetId) : null;
  const atkName = atk?.defId ? nameOf(atk.defId) : "Attacker";
  const defName = def?.defId ? nameOf(def.defId) : "Defender";
  return `Battle: ${atkName} (${atk?.power ?? "?"}) → ${defName} (${def?.power ?? "?"})`;
}
