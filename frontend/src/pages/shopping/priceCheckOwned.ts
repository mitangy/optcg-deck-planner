import type { CatalogCardResult, OwnedCard } from "../../api";

/**
 * Copies of a Price check row's art in the live owned collection: the base art's count for a
 * base row, that alt's own count for an alt row. Ids compare upper-case like the cache patches do.
 */
export function priceCheckOwned(items: OwnedCard[], card: Pick<CatalogCardResult, "card_id" | "alt_product_id">): number {
  const id = card.card_id.toUpperCase();
  const item = items.find((i) => i.card_id.toUpperCase() === id);
  if (!item) return 0;
  if (!card.alt_product_id) return item.owned;
  return item.alt_arts?.find((a) => a.product_id === card.alt_product_id)?.owned ?? 0;
}
