import { jsonArrayCodec } from "@optcg/ui/storage";
import type { CatalogCardResult } from "../../api";

export const PRICE_CHECK_RECENTS_MAX = 8;

export const recentKey = (card: CatalogCardResult): string => `${card.card_id}:${card.alt_product_id ?? 0}`;

/** Most recent first, one entry per card art, capped. */
export function withRecentLookup(list: CatalogCardResult[], card: CatalogCardResult): CatalogCardResult[] {
  const key = recentKey(card);
  return [card, ...list.filter((c) => recentKey(c) !== key)].slice(0, PRICE_CHECK_RECENTS_MAX);
}

const isStoredCard = (x: unknown): x is CatalogCardResult =>
  typeof x === "object" && x !== null && typeof (x as CatalogCardResult).card_id === "string" && typeof (x as CatalogCardResult).name === "string";

export const recentLookupsCodec = jsonArrayCodec(isStoredCard);
