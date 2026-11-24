import { lookupCard } from "../../cards/atlas";
import { counterValueFor, formatCounter } from "../../cards/counterValue";
import type { Intent, PlayerView } from "../../net/protocol";
import { handIndexOf } from "../prompts/intentFields";
import { battleEndpoints } from "./battleArc";
import { counterAfterBlock } from "./counterSkipBlock";
import { findCard } from "./battleBanner";
import { defenseStatus, stagedCounterTotal } from "./defendTrayModel";

export type DefendPhase = "block" | "counter";

export type DefendStaging = {
  counterIds: readonly string[];
  blockerId: string | null;
};

export type BlockerChip = { id: string; defId: string; artCopy?: number; name: string; power: number | null };
export type CounterChip = { id: string; defId: string; artCopy?: number; name: string; value: number | null };
export type EarlyCounterChip = { id: string; defId: string; artCopy?: number; name: string; label: string };
export type EventChip = {
  id: string;
  defId: string;
  artCopy?: number;
  name: string;
  cost: number;
  valueLabel: string;
  intent: Intent;
};

export type DefendModel = {
  phase: DefendPhase;
  attackerName: string;
  attackerPower: number | null;
  defenderName: string;
  defenderPower: number | null;
  blocking: boolean;
  preview: boolean;
  gap: number | null;
  remaining: number | null;
  blockers: BlockerChip[];
  counters: CounterChip[];
  events: EventChip[];
  earlyCounters: EarlyCounterChip[];
  stagedIds: string[];
  stagedTotal: number;
  stagedUnknown: boolean;
  stagedBlockerId: string | null;
};

function nameOf(defId: string): string {
  return lookupCard(defId).name;
}

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
          ...(card.artCopy !== undefined ? { artCopy: card.artCopy } : {}),
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
      const handIndex = handIndexOf(i);
      if (handIndex === undefined) continue;
      const card = view.you.hand[handIndex];
      if (!card) continue;
      const entry = lookupCard(card.defId);
      if (i.type === "counter_from_hand") {
        counters.push({
          id: card.id,
          defId: card.defId,
          ...(card.artCopy !== undefined ? { artCopy: card.artCopy } : {}),
          name: entry.name,
          value: card.counter ?? counterValueFor(entry)?.base ?? null,
        });
      } else if (i.type === "counter_event") {
        const value = counterValueFor(entry);
        events.push({
          id: card.id,
          defId: card.defId,
          ...(card.artCopy !== undefined ? { artCopy: card.artCopy } : {}),
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
        ...(card.artCopy !== undefined ? { artCopy: card.artCopy } : {}),
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

const showPower = (n: number | null): string => (n == null ? "?" : String(n));

// "Nico Robin (4000) attacks your Leader (7000)"; "if it blocks" while a Blocker is only being previewed.
export function attackSummary(
  m: Pick<DefendModel, "attackerName" | "attackerPower" | "defenderName" | "defenderPower" | "blocking" | "preview">,
): string {
  return `${m.attackerName} (${showPower(m.attackerPower)}) attacks ${m.blocking ? "Blocker " : ""}${m.defenderName} (${showPower(m.defenderPower)})${m.preview ? " if it blocks" : ""}`;
}

export function defendVerdict(
  m: Pick<DefendModel, "phase" | "gap" | "remaining" | "stagedIds" | "stagedTotal" | "stagedUnknown">,
): { text: string; safe: boolean } {
  if (m.gap == null || m.remaining == null) return { text: "Attack incoming", safe: false };
  const safe = m.remaining === 0;
  if (m.phase === "counter" && m.stagedIds.length > 0) {
    const total = `+${m.stagedTotal}${m.stagedUnknown ? "+" : ""} staged`;
    if (m.stagedUnknown) return { text: total, safe };
    return { text: safe ? `${total} · Safe` : `${total} · still short by ${m.remaining}`, safe };
  }
  if (m.gap === 0) return { text: "Safe", safe: true };
  return { text: `Need +${m.gap} to survive`, safe: false };
}
