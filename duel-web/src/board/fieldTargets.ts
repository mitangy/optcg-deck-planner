import type { ChoiceOptionView } from "../net/protocol";

/**
 * True when every option the player can pick is a card on the field (Leader,
 * Character or Stage, either side), so the choice is made by tapping the board
 * instead of in a pop-up grid. Hand / trash / deck / Life cards and DON!!
 * options keep the pop-up. Ineligible options don't count: they can't be
 * picked, so they only appear as plain cards on the board.
 */
export function allOptionsOnField(options: readonly ChoiceOptionView[], onBoard: { has(instanceId: string): boolean }): boolean {
  const pickable = options.filter((o) => o.eligible);
  return pickable.length > 0 && pickable.every((o) => o.zone !== "don" && !!o.instanceId && onBoard.has(o.instanceId));
}

/** Toggle one id in a pick list that holds at most `max` ids (a single pick swaps). */
export function toggleSelection(selected: readonly string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (max === 1) return [id];
  return selected.length >= max ? [...selected] : [...selected, id];
}

/** One-tap: exactly one pick is wanted, so choosing it answers at once. */
export function resolvesOnPick(oneTap: boolean, min: number, max: number): boolean {
  return oneTap && min === 1 && max === 1;
}

/** "Choose 1" / "Choose up to 2" / "Choose 1–3", plus how many are picked when more than one can be. */
export function pickCaption(min: number, max: number, selectedCount: number): string {
  const range = min === max ? `${max}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
  return max > 1 ? `Choose ${range} · selected ${selectedCount}` : `Choose ${range}`;
}
