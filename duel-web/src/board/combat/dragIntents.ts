import type { Intent } from "../../net/protocol";
import type { PlayCardIntent } from "../prompts/intentFields";
import { findAttackIntent } from "../prompts/intentFilter";

export type DragPayload =
  | { type: "give_don"; donIds: string[] }
  | { type: "play_card"; handIndex: number }
  | { type: "attack"; attackerId: string }
  | { type: "counter"; handIndex: number };

export type DropTarget =
  | { kind: "give_don_target"; targetId: string }
  | { kind: "play_field" }
  | { kind: "play_trash"; characterId: string }
  | { kind: "attack_target"; targetId: string }
  | { kind: "counter_target"; targetId: string };

export type DropContext = {
  opponentLeaderId?: string;
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

export function canDragDon(intents: Intent[], donId: string): boolean {
  return intents.some((i) => isGiveDon(i) && i.donId === donId);
}

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

export function canDragHandCard(intents: Intent[], handIndex: number): boolean {
  return intents.some((i) => isPlayCard(i) && i.handIndex === handIndex);
}

export function canDropPlayOnField(intents: Intent[], handIndex: number): boolean {
  return intents.some(
    (i) => isPlayCard(i) && i.handIndex === handIndex && i.trashCharacterId == null,
  );
}

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

export function playNeedsReplace(intents: Intent[], handIndex: number): boolean {
  return playCardTrashTargetIds(intents, handIndex).length > 0;
}

// The engine lists one play per Character that could be trashed; keep one per hand card so the bar shows a single Play that opens the replace prompt.
export function collapseReplacePlays(intents: Intent[]): Intent[] {
  const seen = new Set<number>();
  return intents.filter((i) => {
    if (!isPlayCard(i) || typeof i.trashCharacterId !== "string") return true;
    if (seen.has(i.handIndex)) return false;
    seen.add(i.handIndex);
    return true;
  });
}

export function isReplacePlay(intent: Intent): intent is PlayCardIntent & { trashCharacterId: string } {
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

export function canDragAttacker(intents: Intent[], attackerId: string): boolean {
  return intents.some((i) => i.type === "declare_attack" && i.attackerId === attackerId);
}

export function matchCounter(intents: Intent[], handIndex: number): Intent | null {
  return (
    intents.find(
      (i) =>
        (i.type === "counter_from_hand" || i.type === "counter_event") &&
        i.handIndex === handIndex,
    ) ?? null
  );
}

export function canDragCounter(intents: Intent[], handIndex: number): boolean {
  return matchCounter(intents, handIndex) != null;
}

export function resolveDropIntents(
  payload: DragPayload | null,
  drop: DropTarget | null,
  intents: Intent[],
  ctx: DropContext = {},
): Intent[] {
  if (!payload) return [];
  if (payload.type === "play_card") {
    if (drop?.kind === "play_trash") {
      const intent = matchPlayCardTrash(intents, payload.handIndex, drop.characterId);
      return intent ? [intent] : [];
    }
    const intent = matchPlayCardOnField(intents, payload.handIndex);
    return intent ? [intent] : [];
  }
  if (!drop) return [];
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
    if (!ctx.defenderId || drop.targetId !== ctx.defenderId) return [];
    const intent = matchCounter(intents, payload.handIndex);
    if (intent) return [intent];
    const pass = intents.find((i) => i.type === "pass_block");
    return pass ? [pass] : [];
  }
  if (payload.type === "give_don" && drop.kind === "give_don_target") {
    return matchGiveDonMulti(intents, payload.donIds, drop.targetId);
  }
  return [];
}

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
