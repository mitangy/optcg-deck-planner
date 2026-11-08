import { arcGeometry, type ArcGeometry, type Box, type Pt } from "./battleArc";
import type { DropTarget } from "./dragIntents";

export type DragArrow = {
  arc: ArcGeometry;
  /** The legal target the pointer is over (the arrow snaps to it), else null. */
  targetId: string | null;
  targetBox: Box | null;
};

/**
 * The aim arrow while an attacker is dragged: from the attacker to the card
 * under the pointer when it is a legal target, else to the pointer itself.
 * Null while the pointer is still over the attacker (nothing to point at yet).
 */
export function dragArrow(
  attacker: Box,
  pointer: Pt,
  hover: DropTarget | null,
  findBox: (instanceId: string) => Box | null,
): DragArrow | null {
  const hoverId = hover?.kind === "attack_target" ? hover.targetId : null;
  const targetBox = hoverId ? findBox(hoverId) : null;
  if (targetBox) return { arc: arcGeometry(attacker, targetBox), targetId: hoverId, targetBox };
  const inside =
    pointer.x >= attacker.left &&
    pointer.x <= attacker.left + attacker.width &&
    pointer.y >= attacker.top &&
    pointer.y <= attacker.top + attacker.height;
  if (inside) return null;
  const tip = { left: pointer.x, top: pointer.y, width: 0, height: 0 };
  return { arc: arcGeometry(attacker, tip), targetId: null, targetBox: null };
}
