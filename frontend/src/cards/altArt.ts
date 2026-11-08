import type { PrintingView } from "../api";

type HasAlts<A extends { product_id?: number | null; owned?: number | null } = PrintingView> = {
  alt_arts?: A[] | null;
  /** The viewer's chosen art: null/undefined = automatic, 0 = base, >0 = a product id. */
  display_art?: number | null;
};

/**
 * The alt art to show as a card's main image. A chosen `display_art` wins
 * (0 = base art, or a listed alt even if unowned); otherwise the alt the user
 * owns the most copies of (ties go to the first in the list). Null means the
 * base art is shown.
 */
export function featuredAlt<A extends { product_id?: number | null; owned?: number | null }>(card: HasAlts<A>): A | null {
  const chosen = card.display_art;
  if (chosen === 0) return null;
  if (chosen != null && chosen > 0) {
    const picked = (card.alt_arts ?? []).find((a) => a.product_id === chosen);
    if (picked) return picked;
  }
  let best: A | null = null;
  for (const alt of card.alt_arts ?? []) {
    const n = alt.owned ?? 0;
    if (n > 0 && (best === null || n > (best.owned ?? 0))) best = alt;
  }
  return best;
}

/** Product id of the art shown as the card's main image (0 = base). */
export function shownProductId(card: HasAlts): number {
  return featuredAlt(card)?.product_id ?? 0;
}

/**
 * Market price and product id of the art a card shows as its main image (#928): the featured alt's
 * own, else the card's standard printing. The product id keys the "Last 3 sold" lookup.
 */
export function shownMarket<A extends { product_id?: number | null; owned?: number | null; market_price?: number | null }>(
  card: HasAlts<A> & { market_price: number | null | undefined; product_id?: number | null },
): { price: number | null | undefined; productId: number | null | undefined } {
  const alt = featuredAlt(card);
  return alt ? { price: alt.market_price, productId: alt.product_id } : { price: card.market_price, productId: card.product_id };
}

/** Main image URL for a card: its featured owned alt, else the base art. */
export function mainImageUrl(card: HasAlts & { image_url?: string | null }): string | undefined {
  return featuredAlt(card)?.image_url || card.image_url || undefined;
}

/**
 * The "Base" tile for the alt-arts row; null unless an owned alt is the main
 * image. `always` keeps it even then, for pages that edit the base count there.
 */
export function baseTileFor(
  card: HasAlts & {
    name: string;
    image_url?: string | null;
    market_price: number | null | undefined;
    product_id?: number | null;
  },
  always = false,
) {
  if (!always && !featuredAlt(card)) return null;
  return {
    name: card.name,
    image_url: card.image_url || undefined,
    market_price: card.market_price,
    product_id: card.product_id,
  };
}
