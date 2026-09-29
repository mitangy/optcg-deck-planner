import type { PlayerView } from "../net/protocol";

export type BattleEndpoints = {
  attackerId: string;
  /** Card currently being hit (blocker when one stepped in). */
  targetId: string;
  /** Original target when a Blocker redirected the attack. */
  redirectedFromId: string | null;
  /** True when the viewer's side is the one under attack. */
  incoming: boolean;
};

type RawBattle = {
  attackerId?: unknown;
  attackerSeat?: unknown;
  target?: { kind?: unknown; instanceId?: unknown } | null;
  blockerId?: unknown;
  originalTargetId?: unknown;
};

function sideOf(view: PlayerView, id: string): "you" | "opponent" | null {
  for (const side of ["you", "opponent"] as const) {
    const p = view[side];
    if (p.leader.id === id) return side;
    if (p.characters.some((c) => c.id === id)) return side;
    if (p.stage?.id === id) return side;
  }
  return null;
}

/**
 * Attacker → target instance ids from the server battle state. Leader targets
 * resolve to the defending seat's leader; a Blocker replaces the target.
 * Returns null when there is no battle or the ids are not on the board.
 */
export function battleEndpoints(view: PlayerView | null): BattleEndpoints | null {
  const b = view?.battle as RawBattle | null | undefined;
  if (!view || !b || typeof b.attackerId !== "string") return null;
  const attackerId = b.attackerId;
  const attackerSide = sideOf(view, attackerId);
  if (!attackerSide) return null;
  const defenderSide = attackerSide === "you" ? "opponent" : "you";

  let declared: string | null = null;
  if (b.target?.kind === "leader") declared = view[defenderSide].leader.id;
  else if (typeof b.target?.instanceId === "string") declared = b.target.instanceId;

  const blocker = typeof b.blockerId === "string" ? b.blockerId : null;
  const targetId = blocker ?? declared;
  if (!targetId || sideOf(view, targetId) == null) return null;

  const original =
    typeof b.originalTargetId === "string"
      ? b.originalTargetId
      : blocker && declared !== blocker
        ? declared
        : null;
  const redirectedFromId =
    original && original !== targetId && sideOf(view, original) ? original : null;

  return { attackerId, targetId, redirectedFromId, incoming: defenderSide === "you" };
}

export type Pt = { x: number; y: number };
export type Box = { left: number; top: number; width: number; height: number };

export function boxCenter(b: Box): Pt {
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

export type ArcGeometry = {
  from: Pt;
  to: Pt;
  control: Pt;
  /** SVG path "M … Q …" for the cannonball flight. */
  d: string;
  length: number;
};

/**
 * Cannon-shot arc from the attacker to the target. The curve bows sideways
 * (perpendicular to the shot) so it reads as a lob across the table rather
 * than a straight line through the cards between them. Endpoints are pulled
 * in from the card centres so the arc starts/ends on the card faces.
 */
export function arcGeometry(fromBox: Box, toBox: Box): ArcGeometry {
  const a = boxCenter(fromBox);
  const b = boxCenter(toBox);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Start near the attacker's edge, finish just short of the target centre
  // (the reticle sits there).
  const startInset = Math.min(fromBox.height, fromBox.width) * 0.3;
  const endInset = Math.min(toBox.height, toBox.width) * 0.18;
  const from = { x: a.x + ux * startInset, y: a.y + uy * startInset };
  const to = { x: b.x - ux * endInset, y: b.y - uy * endInset };
  // Bow to the right of travel; bigger bow for longer shots, capped.
  const bow = Math.min(dist * 0.28, 140);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const control = { x: mid.x - uy * bow, y: mid.y + ux * bow };
  const r = (n: number) => Math.round(n * 10) / 10;
  const d = `M ${r(from.x)} ${r(from.y)} Q ${r(control.x)} ${r(control.y)} ${r(to.x)} ${r(to.y)}`;
  // Quadratic length approximation (chord + control polygon) / 2.
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  const poly =
    Math.hypot(control.x - from.x, control.y - from.y) +
    Math.hypot(to.x - control.x, to.y - control.y);
  return { from, to, control, d, length: (chord + poly) / 2 };
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}
