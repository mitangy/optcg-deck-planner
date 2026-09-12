import type { Intent } from "../net/protocol";

/** Intent types that are always available regardless of card selection. */
const GLOBAL_INTENT_TYPES = new Set<string>([
  "end_turn",
  "pass_block",
  "pass_counter",
  // Life-trigger legacy name + generalized pending-choice (ability prompts PR).
  "resolve_trigger",
  "resolve_pending_choice",
  "mulligan",
]);

export type IntentSelection = {
  /** Selected hand card index, or null if none selected. */
  handIndex?: number | null;
  /** Selected board card instance id (leader/character), or null if none selected. */
  boardId?: string | null;
};

function isGlobalIntent(intent: Intent): boolean {
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

/** True when a legal intent references this board instance id in any actionable role. */
export function matchesBoardId(intent: Intent, boardId: string): boolean {
  return (
    intent.attackerId === boardId ||
    intent.targetId === boardId ||
    intent.blockerId === boardId ||
    intent.donId === boardId
  );
}

/**
 * Contextual actions for the current selection:
 * - Nothing selected: only phase-global actions (end_turn, pass_*, resolve_trigger, mulligan).
 * - Hand card selected: play_card / counter_from_hand / counter_event for that index + globals.
 * - Board card selected: intents where that id is the attacker, activator/target, give_don
 *   target, or blocker + globals.
 */
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

/** True when the board instance has any non-global legal action available. */
export function hasBoardActions(intents: Intent[], boardId: string): boolean {
  return intents.some((i) => matchesBoardId(i, boardId));
}

/**
 * Legal attack target instance ids for a selected attacker. `opponentLeaderId` resolves
 * the leader-kind target (which carries no instanceId on the wire) to a concrete id so
 * board tiles can be highlighted/tapped for a second-tap attack.
 */
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

/** Find the declare_attack intent for this attacker/target pair, if legal. */
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
