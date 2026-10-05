import { lookupCard } from "../cards/atlas";
import { counterValueFor, formatCounter } from "../cards/counterValue";
import type { Intent, PlayerView } from "../net/protocol";
import { battleEndpoints } from "./battleArc";
import { counterAfterBlock } from "./counterSkipBlock";
import { findCard } from "./battleBanner";
import { defenseStatus, stagedCounterTotal } from "./defendTray";

export type DefendPhase = "block" | "counter";

export type DefendStaging = {
  /** Hand card ids staged for `counter_from_hand`. */
  counterIds: readonly string[];
  /** Blocker selected but not yet declared. */
  blockerId: string | null;
};

export type BlockerChip = { id: string; defId: string; name: string; power: number | null };
export type CounterChip = { id: string; defId: string; name: string; value: number | null };
/** Block step: a hand card that skips the block and counters (drag, or tap). */
export type EarlyCounterChip = { id: string; defId: string; name: string; label: string };
export type EventChip = {
  id: string;
  defId: string;
  name: string;
  cost: number;
  /** "+2000", "+2000 / +4000", or "Counter" when the event only has effects. */
  valueLabel: string;
  intent: Intent;
};

/** Everything the defend tray and its primary button show for one battle. */
export type DefendModel = {
  phase: DefendPhase;
  attackerName: string;
  attackerPower: number | null;
  defenderName: string;
  defenderPower: number | null;
  /** A Blocker has taken the hit (or is about to, in the block step). */
  blocking: boolean;
  /** The blocker is only selected, not declared yet. */
  preview: boolean;
  /** Extra power to survive / what is left after the staged counters; null without powers. */
  gap: number | null;
  remaining: number | null;
  blockers: BlockerChip[];
  counters: CounterChip[];
  events: EventChip[];
  /** Block step only: Counter cards / Events the counter step will take. */
  earlyCounters: EarlyCounterChip[];
  /** Staged counters that are still legal, in tap order. */
  stagedIds: string[];
  stagedTotal: number;
  /** A staged card has no known Counter value, so the total is a floor. */
  stagedUnknown: boolean;
  stagedBlockerId: string | null;
};

function nameOf(defId: string): string {
  return lookupCard(defId).name;
}

/**
 * The defend tray's data, or null when you are not the one answering an
 * attack (only Pass block / Pass counter make you the defender).
 */
export function deriveDefend(
  view: PlayerView,
  intents: readonly Intent[],
  staging: DefendStaging,
): DefendModel | null {
  const phase: DefendPhase | null = intents.some((i) => i.type === "pass_block")
    ? "block"
    : intents.some((i) => i.type === "pass_counter")
      ? "counter"
      : null;
  if (!phase) return null;

  const ends = battleEndpoints(view);
  const attacker = ends ? findCard(view, ends.attackerId) : null;
  const target = ends ? findCard(view, ends.targetId) : null;

  const blockers: BlockerChip[] = [];
  if (phase === "block") {
    for (const i of intents) {
      if (i.type !== "declare_block" || typeof i.blockerId !== "string") continue;
      const card = view.you.characters.find((c) => c.id === i.blockerId);
      if (card) {
        blockers.push({
          id: card.id,
          defId: card.defId,
          name: nameOf(card.defId),
          power: card.power ?? null,
        });
      }
    }
  }
  const previewBlocker = blockers.find((b) => b.id === staging.blockerId) ?? null;
  const defender = previewBlocker
    ? (view.you.characters.find((c) => c.id === previewBlocker.id) ?? null)
    : target;

  const counters: CounterChip[] = [];
  const events: EventChip[] = [];
  if (phase === "counter") {
    for (const i of intents) {
      if (typeof i.handIndex !== "number") continue;
      const card = view.you.hand[i.handIndex];
      if (!card) continue;
      const entry = lookupCard(card.defId);
      if (i.type === "counter_from_hand") {
        counters.push({
          id: card.id,
          defId: card.defId,
          name: entry.name,
          // The engine's live Counter (statics like "+2000 Counter") beats the printed one.
          value: card.counter ?? counterValueFor(entry)?.base ?? null,
        });
      } else if (i.type === "counter_event") {
        const value = counterValueFor(entry);
        events.push({
          id: card.id,
          defId: card.defId,
          name: entry.name,
          cost: card.playCost ?? entry.cost,
          valueLabel: value ? formatCounter(value) : "Counter",
          intent: i,
        });
      }
    }
  }

  const earlyCounters: EarlyCounterChip[] = [];
  if (phase === "block") {
    for (const card of view.you.hand) {
      if (!counterAfterBlock(card, view.you.activeDonCount)) continue;
      const entry = lookupCard(card.defId);
      const value = card.counter != null ? null : counterValueFor(entry);
      earlyCounters.push({
        id: card.id,
        defId: card.defId,
        name: entry.name,
        label: card.counter != null ? `+${card.counter}` : value ? formatCounter(value) : "Counter",
      });
    }
  }

  const legal = new Set(counters.map((c) => c.id));
  const stagedIds = [...new Set(staging.counterIds)].filter((id) => legal.has(id));
  const values = new Map<string, number>();
  for (const c of counters) if (c.value != null) values.set(c.id, c.value);
  const stagedTotal = stagedCounterTotal(stagedIds, values);

  const attackerPower = attacker?.power ?? null;
  const defenderPower = defender?.power ?? null;
  const status =
    attackerPower != null && defenderPower != null
      ? defenseStatus(attackerPower, defenderPower, stagedTotal)
      : null;

  return {
    phase,
    attackerName: attacker ? nameOf(attacker.defId) : "Attacker",
    attackerPower,
    defenderName: !defender
      ? "your card"
      : defender.id === view.you.leader.id
        ? "your Leader"
        : nameOf(defender.defId),
    defenderPower,
    blocking: previewBlocker != null || ends?.redirectedFromId != null,
    preview: previewBlocker != null,
    gap: status?.gap ?? null,
    remaining: status?.remaining ?? null,
    blockers,
    counters,
    events,
    earlyCounters,
    stagedIds,
    stagedTotal,
    stagedUnknown: stagedIds.some((id) => !values.has(id)),
    stagedBlockerId: previewBlocker?.id ?? null,
  };
}
