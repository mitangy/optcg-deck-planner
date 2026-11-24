import type { Intent } from "../../net/protocol";

const GLOBAL_INTENT_TYPES = new Set<string>([
  "end_turn",
  "pass_block",
  "pass_counter",
  "resolve_trigger",
  "resolve_pending_choice",
  "mulligan",
]);

export type IntentSelection = {
  handIndex?: number | null;
  boardId?: string | null;
};

export function isGlobalIntent(intent: Intent): boolean {
  return GLOBAL_INTENT_TYPES.has(intent.type);
}

function matchesHand(intent: Intent, handIndex: number): boolean {
  switch (intent.type) {
    case "play_card":
    case "counter_from_hand":
    case "counter_event":
      return intent.handIndex === handIndex;
    default:
      return false;
  }
}

export function matchesBoardId(intent: Intent, boardId: string): boolean {
  const type: string = intent.type;
  if (type === "activate_ability" || type === "activate_leader") {
    const activation = intent as { sourceId?: string; targetId?: string };
    if (activation.sourceId === boardId) return true;
    // Without sourceId (legacy), the selected id is the give target.
    if (type === "activate_leader" && activation.sourceId == null) {
      return activation.targetId === boardId;
    }
    return false;
  }
  const ids = intent as { attackerId?: string; targetId?: string; blockerId?: string; donId?: string };
  return (
    ids.attackerId === boardId ||
    ids.targetId === boardId ||
    ids.blockerId === boardId ||
    ids.donId === boardId
  );
}

export function filterIntentsForSelection(
  intents: Intent[],
  selection: IntentSelection,
): Intent[] {
  const handIndex = selection.handIndex ?? null;
  const boardId = selection.boardId ?? null;

  if (handIndex != null) {
    return intents.filter((i) => isGlobalIntent(i) || matchesHand(i, handIndex));
  }
  if (boardId != null) {
    return intents.filter((i) => isGlobalIntent(i) || matchesBoardId(i, boardId));
  }
  return intents.filter(isGlobalIntent);
}

export function hasBoardActions(intents: Intent[], boardId: string): boolean {
  return intents.some((i) => matchesBoardId(i, boardId));
}

export function attackTargetIdsForAttacker(
  intents: Intent[],
  attackerId: string,
  opponentLeaderId: string,
): string[] {
  const ids = new Set<string>();
  for (const intent of intents) {
    if (intent.type !== "declare_attack" || intent.attackerId !== attackerId) continue;
    const target = intent.target as { kind?: string; instanceId?: string } | undefined;
    if (!target) continue;
    if (target.kind === "leader") ids.add(opponentLeaderId);
    else if (target.kind === "character" && target.instanceId) ids.add(target.instanceId);
  }
  return [...ids];
}

export function findAttackIntent(
  intents: Intent[],
  attackerId: string,
  targetId: string,
  opponentLeaderId: string,
): Intent | null {
  return (
    intents.find((intent) => {
      if (intent.type !== "declare_attack" || intent.attackerId !== attackerId) return false;
      const target = intent.target as { kind?: string; instanceId?: string } | undefined;
      if (!target) return false;
      if (target.kind === "leader") return targetId === opponentLeaderId;
      if (target.kind === "character") return target.instanceId === targetId;
      return false;
    }) ?? null
  );
}
