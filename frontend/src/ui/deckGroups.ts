import type { DeckSummary } from "../api";

export type DeckGroup = { key: string; label: string; decks: DeckSummary[] };

export const NO_LEADER_LABEL = "No leader";

/**
 * "Include decks" chips grouped by leader (#1184). Groups run in the order of their earliest deck
 * (lowest sort_order); decks inside a group keep the order they came in.
 */
export function groupDecksByLeader(decks: DeckSummary[]): DeckGroup[] {
  const groups = new Map<string, DeckGroup & { first: number }>();
  for (const d of decks) {
    const key = d.leader_card_id ?? "";
    const g = groups.get(key);
    if (g) {
      g.decks.push(d);
      g.first = Math.min(g.first, d.sort_order);
    } else {
      groups.set(key, {
        key,
        label: d.leader_name || d.leader_card_id || NO_LEADER_LABEL,
        decks: [d],
        first: d.sort_order,
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.first - b.first)
    .map(({ key, label, decks: ds }) => ({ key, label, decks: ds }));
}

export type GroupState = "all" | "some" | "none";

export function groupState(groupIds: number[], selected: number[]): GroupState {
  const on = groupIds.filter((id) => selected.includes(id)).length;
  if (on === 0) return "none";
  return on === groupIds.length ? "all" : "some";
}

/**
 * Ticks every deck of a leader, or unticks them when all are ticked. At least one deck in total
 * stays selected, so unticking the last ticked group changes nothing.
 */
export function toggleGroupDecks(current: number[], groupIds: number[]): number[] {
  if (groupState(groupIds, current) === "all") {
    const next = current.filter((id) => !groupIds.includes(id));
    return next.length ? next : current;
  }
  return [...current, ...groupIds.filter((id) => !current.includes(id))];
}

/** The Extra copies chip shows when the user has any, or while it is off so it can be turned back on. */
export function showExtraCopiesChip(hasCollectorWants: boolean, includeCollector: boolean): boolean {
  return hasCollectorWants || !includeCollector;
}

/** Filter-summary words for the chips outside the decks: "No added cards", "No extra copies". */
export function otherChipSummary(includeExtras: boolean, includeCollector: boolean): string[] {
  const parts: string[] = [];
  if (!includeExtras) parts.push("No added cards");
  if (!includeCollector) parts.push("No extra copies");
  return parts;
}
