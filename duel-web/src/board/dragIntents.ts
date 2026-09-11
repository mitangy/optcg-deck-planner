import type { Intent } from "../net/protocol";

/** Active pointer-drag payload for legal give_don / play_card intents. */
export type DragPayload =
  | { type: "give_don"; donId: string }
  | { type: "play_card"; handIndex: number };

export type DropTarget =
  | { kind: "give_don_target"; targetId: string }
  | { kind: "play_field" }
  | { kind: "play_trash"; characterId: string };

function isGiveDon(
  intent: Intent,
): intent is Intent & { type: "give_don"; donId: string; targetId: string } {
  return (
    intent.type === "give_don" &&
    typeof intent.donId === "string" &&
    typeof intent.targetId === "string"
  );
}

function isPlayCard(
  intent: Intent,
): intent is Intent & {
  type: "play_card";
  handIndex: number;
  trashCharacterId?: string;
} {
  return intent.type === "play_card" && typeof intent.handIndex === "number";
}

/** True when any legal give_don uses this cost-area DON!! id. */
export function canDragDon(intents: Intent[], donId: string): boolean {
  return intents.some((i) => isGiveDon(i) && i.donId === donId);
}

/** Target instance ids for give_don with this donId. */
export function giveDonTargetIds(intents: Intent[], donId: string): string[] {
  const ids = new Set<string>();
  for (const i of intents) {
    if (isGiveDon(i) && i.donId === donId) ids.add(i.targetId);
  }
  return [...ids];
}

export function matchGiveDon(
  intents: Intent[],
  donId: string,
  targetId: string,
): Intent | null {
  return (
    intents.find((i) => isGiveDon(i) && i.donId === donId && i.targetId === targetId) ?? null
  );
}

/** True when any legal play_card uses this hand index. */
export function canDragHandCard(intents: Intent[], handIndex: number): boolean {
  return intents.some((i) => isPlayCard(i) && i.handIndex === handIndex);
}

/** play_card without trashCharacterId — drop on stage/character area. */
export function canDropPlayOnField(intents: Intent[], handIndex: number): boolean {
  return intents.some(
    (i) => isPlayCard(i) && i.handIndex === handIndex && i.trashCharacterId == null,
  );
}

/** Character ids that may be trashed when playing this hand card onto a full board. */
export function playCardTrashTargetIds(intents: Intent[], handIndex: number): string[] {
  const ids = new Set<string>();
  for (const i of intents) {
    if (
      isPlayCard(i) &&
      i.handIndex === handIndex &&
      typeof i.trashCharacterId === "string"
    ) {
      ids.add(i.trashCharacterId);
    }
  }
  return [...ids];
}

export function matchPlayCardOnField(intents: Intent[], handIndex: number): Intent | null {
  return (
    intents.find(
      (i) => isPlayCard(i) && i.handIndex === handIndex && i.trashCharacterId == null,
    ) ?? null
  );
}

export function matchPlayCardTrash(
  intents: Intent[],
  handIndex: number,
  trashCharacterId: string,
): Intent | null {
  return (
    intents.find(
      (i) =>
        isPlayCard(i) &&
        i.handIndex === handIndex &&
        i.trashCharacterId === trashCharacterId,
    ) ?? null
  );
}

/** Map a drag payload + drop target to a legal intent (or null). */
export function resolveDropIntent(
  payload: DragPayload | null,
  drop: DropTarget | null,
  intents: Intent[],
): Intent | null {
  if (!payload || !drop) return null;
  if (payload.type === "give_don" && drop.kind === "give_don_target") {
    return matchGiveDon(intents, payload.donId, drop.targetId);
  }
  if (payload.type === "play_card" && drop.kind === "play_field") {
    return matchPlayCardOnField(intents, payload.handIndex);
  }
  if (payload.type === "play_card" && drop.kind === "play_trash") {
    return matchPlayCardTrash(intents, payload.handIndex, drop.characterId);
  }
  return null;
}

/** Parse data-dnd-drop attribute from an element under the pointer. */
export function parseDropAttr(value: string | null | undefined): DropTarget | null {
  if (!value) return null;
  if (value === "play_field") return { kind: "play_field" };
  if (value.startsWith("give_don:")) {
    const targetId = value.slice("give_don:".length);
    return targetId ? { kind: "give_don_target", targetId } : null;
  }
  if (value.startsWith("play_trash:")) {
    const characterId = value.slice("play_trash:".length);
    return characterId ? { kind: "play_trash", characterId } : null;
  }
  return null;
}

export function findDropTargetAtPoint(clientX: number, clientY: number): DropTarget | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) return null;
  const host = el.closest("[data-dnd-drop]");
  if (!host) return null;
  return parseDropAttr(host.getAttribute("data-dnd-drop"));
}
