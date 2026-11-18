import { arcGeometry, type ArcGeometry, type Box, type Pt } from "./battleArc";
import type { DropTarget } from "./dragIntents";

export type DragArrow = {
  arc: ArcGeometry;
  targetId: string | null;
  targetBox: Box | null;
};

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
