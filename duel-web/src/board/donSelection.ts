import type { Intent } from "../net/protocol";
import { giveDonTargetIdsForAll, matchGiveDonMulti } from "./dragIntents";

/**
 * Click-to-attach DON!! flow (alternative to dragging):
 *   1. tap active DON!! chips in the cost area → selection count goes up
 *   2. tap a highlighted Leader / Character → "Attach N DON!!" confirm
 *   3. confirm sends one give_don per selected DON!! (client-side sequence)
 *
 * DON!! cards are interchangeable, so the selection behaves like a counter:
 * tapping an unselected chip adds it, tapping an already-selected chip adds
 * the next unselected legal DON!! (so repeated taps on the same spot count
 * up), and once every legal DON!! is selected the next tap clears back to 0.
 */
export function nextDonSelection(
  prev: ReadonlySet<string>,
  clickedId: string,
  /** Legal (active, give_don-able) DON!! ids in display order. */
  legalIds: readonly string[],
): Set<string> {
  if (!legalIds.includes(clickedId)) return new Set(prev);
  if (!prev.has(clickedId)) return new Set([...prev, clickedId]);
  const nextFree = legalIds.find((id) => !prev.has(id));
  if (nextFree) return new Set([...prev, nextFree]);
  return new Set();
}

/** Drop ids that are no longer legal (rested, spent, turn over). Same ref when unchanged. */
export function pruneDonSelection(
  prev: Set<string>,
  legal: ReadonlySet<string>,
): Set<string> {
  if (prev.size === 0) return prev;
  const next = new Set([...prev].filter((id) => legal.has(id)));
  return next.size === prev.size ? prev : next;
}

/** Leader / Character ids every selected DON!! may legally attach to. */
export function attachTargetIds(intents: Intent[], selected: ReadonlySet<string>): string[] {
  return giveDonTargetIdsForAll(intents, [...selected]);
}

export type PendingAttach = { targetId: string; donIds: string[] };

/**
 * Tapping a board card while DON!! are selected: returns the pending confirm
 * when the card is a legal target for the whole selection, else null.
 */
export function beginAttach(
  intents: Intent[],
  selected: ReadonlySet<string>,
  targetId: string,
): PendingAttach | null {
  if (selected.size === 0) return null;
  if (!attachTargetIds(intents, selected).includes(targetId)) return null;
  return { targetId, donIds: [...selected] };
}

/** Intents to send (in order) when the attach confirm is accepted. */
export function resolveAttachIntents(intents: Intent[], pending: PendingAttach | null): Intent[] {
  if (!pending) return [];
  return matchGiveDonMulti(intents, pending.donIds, pending.targetId);
}

export function attachLabel(count: number): string {
  return `Attach ${count} DON!!`;
}

/** Active DON!! ids (in legal-intent order) that can be given to this card. */
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

/**
 * Amounts offered by the quick attach row: +1, +2, and All when that is more
 * than +2. Nothing when no DON!! can be given.
 */
export function quickAttachCounts(available: number): number[] {
  if (available <= 0) return [];
  if (available === 1) return [1];
  if (available === 2) return [1, 2];
  return [1, 2, available];
}

/**
 * Full wording of one quick attach amount, e.g. "Give 2 DON!! (+2000)" or
 * "Give all 5 DON!! (+5000)". Each DON!! is +1000 power for the turn. `counts`
 * is the row from `quickAttachCounts`; its last entry past +2 is the All chip.
 */
export function quickAttachLabel(count: number, counts: readonly number[]): string {
  const all = count > 2 && count === counts[counts.length - 1];
  return `Give ${all ? "all " : ""}${count} DON!! (+${count * 1000})`;
}

/**
 * The give_don intents for "give this card N DON!!": one per distinct DON!!
 * that is legal for this card (never more than are available), sent in order
 * like the click-to-attach confirm.
 */
export function donQuickAttach(intents: Intent[], targetId: string, count: number): Intent[] {
  const donIds = donIdsForTarget(intents, targetId).slice(0, Math.max(0, count));
  return resolveAttachIntents(intents, { targetId, donIds });
}
