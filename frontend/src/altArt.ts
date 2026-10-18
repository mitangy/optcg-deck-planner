import type { PrintingView } from "./api";

type HasAlts = { alt_arts?: PrintingView[] | null };

/**
 * The alt art to show as a card's main image: the one the user owns the most
 * copies of (ties go to the first in the list). Null when no alt is owned.
 */
export function featuredAlt(card: HasAlts): PrintingView | null {
  let best: PrintingView | null = null;
  for (const alt of card.alt_arts ?? []) {
    const n = alt.owned ?? 0;
    if (n > 0 && (best === null || n > (best.owned ?? 0))) best = alt;
  }
  return best;
}

/** Main image URL for a card: its featured owned alt, else the base art. */
export function mainImageUrl(card: HasAlts & { image_url?: string | null }): string | undefined {
  return featuredAlt(card)?.image_url || card.image_url || undefined;
}

/** The "Base" tile for the alt-arts row; null unless an owned alt is the main image. */
export function baseTileFor(card: HasAlts & {
  name: string;
  image_url?: string | null;
  market_price: number | null | undefined;
  product_id?: number | null;
}) {
  if (!featuredAlt(card)) return null;
  return {
    name: card.name,
    image_url: card.image_url || undefined,
    market_price: card.market_price,
    product_id: card.product_id,
  };
}
