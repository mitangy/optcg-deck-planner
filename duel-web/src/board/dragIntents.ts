import type { Intent } from "../net/protocol";
import { findAttackIntent } from "./intentFilter";

/** Active pointer-drag payload for legal give_don / play_card / attack /
 * counter intents. `donIds` carries the full multi-select (or a lone id when
 * nothing is selected) so one gesture can attach several DON!! in sequence. */
export type DragPayload =
  | { type: "give_don"; donIds: string[] }
  | { type: "play_card"; handIndex: number }
  /** Your Leader / Character dragged onto an opposing card to declare an attack. */
  | { type: "attack"; attackerId: string }
  /** A hand card dragged onto your defending card (counter step, or block step to skip the block). */
  | { type: "counter"; handIndex: number };

export type DropTarget =
  | { kind: "give_don_target"; targetId: string }
  | { kind: "play_field" }
  | { kind: "play_trash"; characterId: string }
  | { kind: "attack_target"; targetId: string }
  | { kind: "counter_target"; targetId: string };

/** Board facts a drop needs that the intents alone do not carry. */
export type DropContext = {
  /** Attack intents name the Leader as `{ kind: "leader" }`, not by id. */
  opponentLeaderId?: string;
  /** The card taking the current attack (after any block): the only counter drop. */
  defenderId?: string | null;
};

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

/**
 * Targets legal for EVERY donId in the set — the intersection used to
 * highlight drop zones during a multi-DON drag so a drop always fully
 * succeeds (every selected DON has a legal give_don there).
 */
export function giveDonTargetIdsForAll(intents: Intent[], donIds: string[]): string[] {
  if (donIds.length === 0) return [];
  let result: Set<string> | null = null;
  for (const donId of donIds) {
    const targets = new Set(giveDonTargetIds(intents, donId));
    if (result === null) {
      result = targets;
      continue;
    }
    for (const t of result) {
      if (!targets.has(t)) result.delete(t);
    }
  }
  return result ? [...result] : [];
}

/**
 * Legal give_don intents for each donId that has one landing on targetId,
 * in donIds order. Callers send these sequentially (client-side, no batch
 * protocol) — donIds without a legal intent to this target are skipped.
 */
export function matchGiveDonMulti(
  intents: Intent[],
  donIds: string[],
  targetId: string,
): Intent[] {
  const out: Intent[] = [];
  for (const donId of donIds) {
    const intent = matchGiveDon(intents, donId, targetId);
    if (intent) out.push(intent);
  }
  return out;
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

/** A full-board play: its owner must pick which Character to trash first. */
export function playNeedsReplace(intents: Intent[], handIndex: number): boolean {
  return playCardTrashTargetIds(intents, handIndex).length > 0;
}

/**
 * The engine lists one full-board play per Character that could be trashed.
 * Keep one entry per hand card so the action bar shows a single "Play" that
 * opens the replace prompt, instead of several look-alike buttons that each
 * silently trash a different Character.
 */
export function collapseReplacePlays(intents: Intent[]): Intent[] {
  const seen = new Set<number>();
  return intents.filter((i) => {
    if (!isPlayCard(i) || typeof i.trashCharacterId !== "string") return true;
    if (seen.has(i.handIndex)) return false;
    seen.add(i.handIndex);
    return true;
  });
}

export function isReplacePlay(intent: Intent): boolean {
  return isPlayCard(intent) && typeof intent.trashCharacterId === "string";
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

/** True when this board card has at least one legal declare_attack. */
export function canDragAttacker(intents: Intent[], attackerId: string): boolean {
  return intents.some((i) => i.type === "declare_attack" && i.attackerId === attackerId);
}

/**
 * The counter intent for this hand slot: a Counter card (`counter_from_hand`)
 * or a Counter Event (`counter_event`). Null when the card cannot counter now.
 */
export function matchCounter(intents: Intent[], handIndex: number): Intent | null {
  return (
    intents.find(
      (i) =>
        (i.type === "counter_from_hand" || i.type === "counter_event") &&
        i.handIndex === handIndex,
    ) ?? null
  );
}

/** True when this hand slot can be dragged onto the defender right now. */
export function canDragCounter(intents: Intent[], handIndex: number): boolean {
  return matchCounter(intents, handIndex) != null;
}

/**
 * Map a drag payload + drop target to the legal intent(s) to send, in send
 * order. give_don with multiple donIds resolves to one intent per don that
 * has a legal give_don to this target (client sends them sequentially).
 */
export function resolveDropIntents(
  payload: DragPayload | null,
  drop: DropTarget | null,
  intents: Intent[],
  ctx: DropContext = {},
): Intent[] {
  if (!payload || !drop) return [];
  if (payload.type === "attack" && drop.kind === "attack_target") {
    if (!ctx.opponentLeaderId) return [];
    const intent = findAttackIntent(
      intents,
      payload.attackerId,
      drop.targetId,
      ctx.opponentLeaderId,
    );
    return intent ? [intent] : [];
  }
  if (payload.type === "counter" && drop.kind === "counter_target") {
    // Only the card actually taking the hit accepts a counter.
    if (!ctx.defenderId || drop.targetId !== ctx.defenderId) return [];
    const intent = matchCounter(intents, payload.handIndex);
    if (intent) return [intent];
    // Block step: the drop skips the block; the counter follows once the
    // counter step is up (see followUpCounter).
    const pass = intents.find((i) => i.type === "pass_block");
    return pass ? [pass] : [];
  }
  if (payload.type === "give_don" && drop.kind === "give_don_target") {
    return matchGiveDonMulti(intents, payload.donIds, drop.targetId);
  }
  if (payload.type === "play_card" && drop.kind === "play_field") {
    const intent = matchPlayCardOnField(intents, payload.handIndex);
    return intent ? [intent] : [];
  }
  if (payload.type === "play_card" && drop.kind === "play_trash") {
    const intent = matchPlayCardTrash(intents, payload.handIndex, drop.characterId);
    return intent ? [intent] : [];
  }
  return [];
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
  if (value.startsWith("attack:")) {
    const targetId = value.slice("attack:".length);
    return targetId ? { kind: "attack_target", targetId } : null;
  }
  if (value.startsWith("counter:")) {
    const targetId = value.slice("counter:".length);
    return targetId ? { kind: "counter_target", targetId } : null;
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
