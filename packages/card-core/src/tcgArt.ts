/**
 * TCGPlayer CDN art helpers. The card-number -> product-id map is `tcgProducts.json`, the one
 * copy (read by rules, duel-web and `backend/scripts/sync_alt_arts.py` / `sync_preview_art.py`).
 * Prefer `_400w` in atlas URLs; clients may rewrite to `_in_1000x1000` for inspect.
 */
import productsJson from "./tcgProducts.json" with { type: "json" };

export type TcgProductHit = {
  productId: number;
  alts: { id: string; label: string; productId: number }[];
};

export const TCG_PRODUCTS = productsJson as Record<string, TcgProductHit>;

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
): { id: string; label: string; imageUrl: string; productId: number }[] {
  const hit = TCG_PRODUCTS[cardId];
  if (!hit?.alts?.length) return [];
  return hit.alts.map((a) => ({
    id: a.id,
    label: a.label,
    imageUrl: tcgProductImageUrl(a.productId, "thumb"),
    productId: a.productId,
  }));
}
