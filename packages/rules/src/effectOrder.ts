/**
 * Simultaneous-effect ordering helpers (OPTCG Comprehensive Rules).
 *
 * When multiple effects trigger at the same timing:
 * 1. Turn player's effects resolve before the opponent's (APNAP-style).
 * 2. Within one player's effects, that player chooses the order.
 *
 * `enqueuePendingChoices` applies those rules when pushing into
 * `MatchState.pendingChoices`. If a seat has 2+ choices in the same window,
 * an `order_effects` prompt is inserted so the client can send
 * `order_pending_effects` before the abilities themselves resolve.
 */
import type {
  GameEvent,
  MatchState,
  PendingChoice,
  Seat,
} from "./types.js";

function alloc(state: MatchState, prefix: string): string {
  const id = `${prefix}_${state.nextId}`;
  state.nextId += 1;
  return id;
}

/** Stable APNAP sort: turn player first, then opponent; stable within a seat. */
export function sortByApnap<T extends { seat: Seat }>(
  items: readonly T[],
  turnPlayer: Seat,
): T[] {
  const opp = (1 - turnPlayer) as Seat;
  return [...items].sort((a, b) => {
    const rank = (s: Seat) => (s === turnPlayer ? 0 : s === opp ? 1 : 2);
    return rank(a.seat) - rank(b.seat);
  });
}

function emitAdded(events: GameEvent[], choice: PendingChoice): void {
  events.push({
    type: "pending_choice_added",
    seat: choice.seat,
    kind: choice.kind,
    cardDefId: choice.cardDefId,
    sourceInstanceId: choice.sourceInstanceId,
    optional: choice.optional,
    prompt: choice.prompt,
  });
}

/**
 * Queue `choices` onto `state.pendingChoices` with APNAP + controller order.
 *
 * - 0 choices: no-op
 * - 1 choice: push as-is
 * - 2+ for one seat: push a single `order_effects` wrapper listing them
 * - Mixed seats: turn-player block first (ordered or single), then opponent
 */
export function enqueuePendingChoices(
  state: MatchState,
  choices: PendingChoice[],
  turnPlayer: Seat,
  events: GameEvent[],
): void {
  if (choices.length === 0) return;
  if (choices.length === 1) {
    state.pendingChoices.push(choices[0]!);
    emitAdded(events, choices[0]!);
    return;
  }

  const ordered = sortByApnap(choices, turnPlayer);
  const turnSeatChoices = ordered.filter((c) => c.seat === turnPlayer);
  const oppSeat = (1 - turnPlayer) as Seat;
  const oppChoices = ordered.filter((c) => c.seat === oppSeat);

  for (const group of [turnSeatChoices, oppChoices]) {
    if (group.length === 0) continue;
    if (group.length === 1) {
      state.pendingChoices.push(group[0]!);
      emitAdded(events, group[0]!);
      continue;
    }

    const seat = group[0]!.seat;
    const prompt =
      `Choose the order to resolve ${group.length} simultaneous effects ` +
      `(you may arrange them freely).`;
    const wrapper: PendingChoice = {
      id: alloc(state, "choice"),
      seat,
      kind: "order_effects",
      cardDefId: group[0]!.cardDefId,
      optional: false,
      prompt,
      unorderedChoices: group,
    };
    state.pendingChoices.push(wrapper);
    emitAdded(events, wrapper);
  }
}

/**
 * Apply a player's chosen order for the front `order_effects` pending choice.
 * Returns false if the permutation is illegal.
 */
export function applyEffectOrder(
  state: MatchState,
  orderedIds: string[],
  events: GameEvent[],
): boolean {
  const front = state.pendingChoices[0];
  if (!front || front.kind !== "order_effects" || !front.unorderedChoices) {
    return false;
  }
  const pool = front.unorderedChoices;
  if (orderedIds.length !== pool.length) return false;
  const seen = new Set<string>();
  const ordered: PendingChoice[] = [];
  for (const id of orderedIds) {
    if (seen.has(id)) return false;
    seen.add(id);
    const hit = pool.find((c) => c.id === id);
    if (!hit) return false;
    ordered.push(hit);
  }
  if (seen.size !== pool.length) return false;

  state.pendingChoices.shift();
  events.push({
    type: "pending_choice_resolved",
    seat: front.seat,
    kind: "order_effects",
    cardDefId: front.cardDefId,
    accepted: true,
  });
  // Insert ordered abilities at the front (preserve any later queue entries).
  state.pendingChoices.unshift(...ordered);
  for (const c of ordered) {
    emitAdded(events, c);
  }
  return true;
}
