/**
 * TCGPlayer CDN art helpers — same source the planner catalog uses.
 * Prefer `_400w` in atlas URLs; clients may rewrite to `_in_1000x1000` for inspect.
 */
import { TCG_PRODUCTS } from "./tcgProducts.js";

export function tcgProductImageUrl(
  productId: number,
  size: "thumb" | "large" = "thumb",
): string {
  const suffix = size === "large" ? "_in_1000x1000" : "_400w";
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}${suffix}.jpg`;
}

export function tcgArtForCard(cardId: string): string | undefined {
  const hit = TCG_PRODUCTS[cardId];
  return hit ? tcgProductImageUrl(hit.productId, "thumb") : undefined;
}

export function tcgAltsForCard(
  cardId: string,
): { id: string; label: string; imageUrl: string }[] {
  const hit = TCG_PRODUCTS[cardId];
  if (!hit?.alts?.length) return [];
  return hit.alts.map((a) => ({
    id: a.id,
    label: a.label,
    imageUrl: tcgProductImageUrl(a.productId, "thumb"),
  }));
}

export function listTcgMappedCardIds(): string[] {
  return Object.keys(TCG_PRODUCTS);
}
