import { useStatsAtlas } from "@optcg/deck-analytics/ui";
import type { StatsAtlas } from "@optcg/deck-analytics";

/**
 * Cards that print "you may have any number of this card in your deck" (Sleeptids OP18-093) come in
 * several arts that complete a set, so the planner offers "One of each art" for them (#1292).
 */
export function isArtSetCard(atlas: StatsAtlas | undefined, cardId: string): boolean {
  return atlas?.[cardId.trim().toUpperCase()]?.rules?.includes("any_number") ?? false;
}

/** The action shows only for an any-number card that has at least one alt art to spread over. */
export function canSpreadArts(
  atlas: StatsAtlas | undefined,
  card: { card_id: string; alt_arts?: unknown[] | null },
): boolean {
  return (card.alt_arts?.length ?? 0) > 0 && isArtSetCard(atlas, card.card_id);
}

/** Card stats load lazily (one shared fetch), so the answer is false until they arrive. */
export function useCanSpreadArts(card: { card_id: string; alt_arts?: unknown[] | null }): boolean {
  return canSpreadArts(useStatsAtlas().data, card);
}
