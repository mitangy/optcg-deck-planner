import type { Intent } from "../../net/protocol";
import { giveDonTargetIdsForAll, matchGiveDonMulti } from "../combat/dragIntents";

// DON!! cards are interchangeable, so the selection behaves like a counter: tapping an already-selected chip adds the next unselected legal one, and past the last the next tap clears to 0.
export function nextDonSelection(
  prev: ReadonlySet<string>,
  clickedId: string,
  legalIds: readonly string[],
): Set<string> {
  if (!legalIds.includes(clickedId)) return new Set(prev);
  if (!prev.has(clickedId)) return new Set([...prev, clickedId]);
  const nextFree = legalIds.find((id) => !prev.has(id));
  if (nextFree) return new Set([...prev, nextFree]);
  return new Set();
}

export function pruneDonSelection(
  prev: Set<string>,
  legal: ReadonlySet<string>,
): Set<string> {
  if (prev.size === 0) return prev;
  const next = new Set([...prev].filter((id) => legal.has(id)));
  return next.size === prev.size ? prev : next;
}

export function attachTargetIds(intents: Intent[], selected: ReadonlySet<string>): string[] {
  return giveDonTargetIdsForAll(intents, [...selected]);
}

export type PendingAttach = { targetId: string; donIds: string[] };

export function beginAttach(
  intents: Intent[],
  selected: ReadonlySet<string>,
  targetId: string,
): PendingAttach | null {
  if (selected.size === 0) return null;
  if (!attachTargetIds(intents, selected).includes(targetId)) return null;
  return { targetId, donIds: [...selected] };
}

export function resolveAttachIntents(intents: Intent[], pending: PendingAttach | null): Intent[] {
  if (!pending) return [];
  return matchGiveDonMulti(intents, pending.donIds, pending.targetId);
}

export function attachLabel(count: number): string {
  return `Attach ${count} DON!!`;
}

export function donIdsForTarget(intents: Intent[], targetId: string): string[] {
  const ids: string[] = [];
  for (const i of intents) {
    if (
      i.type === "give_don" &&
      i.targetId === targetId &&
      typeof i.donId === "string" &&
      !ids.includes(i.donId)
    ) {
      ids.push(i.donId);
    }
  }
  return ids;
}

export function quickAttachCounts(available: number): number[] {
  if (available <= 0) return [];
  if (available === 1) return [1];
  if (available === 2) return [1, 2];
  return [1, 2, available];
}

export function quickAttachLabel(count: number, counts: readonly number[]): string {
  const all = count > 2 && count === counts[counts.length - 1];
  return `Give ${all ? "all " : ""}${count} DON!! (+${count * 1000})`;
}

export function donQuickAttach(intents: Intent[], targetId: string, count: number): Intent[] {
  const donIds = donIdsForTarget(intents, targetId).slice(0, Math.max(0, count));
  return resolveAttachIntents(intents, { targetId, donIds });
}
