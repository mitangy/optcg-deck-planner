import type { PrintingView } from "../api";

type HasAlts<A extends { product_id?: number | null; owned?: number | null } = PrintingView> = {
  alt_arts?: A[] | null;
  display_art?: number | null;
};

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

export function shownProductId(card: HasAlts): number {
  return featuredAlt(card)?.product_id ?? 0;
}

export function shownMarket<A extends { product_id?: number | null; owned?: number | null; market_price?: number | null }>(
  card: HasAlts<A> & { market_price: number | null | undefined; product_id?: number | null },
): { price: number | null | undefined; productId: number | null | undefined } {
  const alt = featuredAlt(card);
  return alt ? { price: alt.market_price, productId: alt.product_id } : { price: card.market_price, productId: card.product_id };
}

export function mainImageUrl(card: HasAlts & { image_url?: string | null }): string | undefined {
  return featuredAlt(card)?.image_url || card.image_url || undefined;
}

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
