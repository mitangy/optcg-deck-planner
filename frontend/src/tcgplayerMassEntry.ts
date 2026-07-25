/** TCGPlayer Mass Entry helpers for shopping / future group-buy exports. */

export const TCGPLAYER_MASS_ENTRY_BASE = "https://www.tcgplayer.com/massentry";
export const TCGPLAYER_PRODUCT_LINE = "One Piece Card Game";

/** Stay under common proxy/browser URL limits (414 on long Mass Entry links). */
export const MASS_ENTRY_URL_MAX_LEN = 1800;

export type MassEntryCard = {
  card_id: string;
  name: string;
  still_need: number;
  product_id?: number | null;
};

export type MassEntryExport = {
  /** Lines suitable for pasting into Mass Entry (product ids + name fallbacks). */
  pasteText: string;
  /** Deep link when short enough; null if empty or too long for a GET URL. */
  url: string | null;
  /** Cards included with still_need > 0. */
  includedCount: number;
  /** Copies summed across included cards. */
  copyCount: number;
  /** Included cards that have a TCGPlayer product id. */
  withProductId: number;
  /** Included cards missing product id (name+number fallback only). */
  missingProductId: number;
};

function productEntry(qty: number, productId: number): string {
  return `${qty}-${productId}`;
}

function nameFallbackEntry(card: MassEntryCard): string {
  const name = (card.name || card.card_id).trim();
  return `${card.still_need} ${name} ${card.card_id}`.trim();
}

export function buildMassEntryExport(cards: MassEntryCard[]): MassEntryExport {
  const included = cards.filter((c) => c.still_need > 0);
  const productParts: string[] = [];
  const fallbackLines: string[] = [];
  let copyCount = 0;

  for (const card of included) {
    copyCount += card.still_need;
    if (card.product_id != null && card.product_id > 0) {
      productParts.push(productEntry(card.still_need, card.product_id));
    } else {
      fallbackLines.push(nameFallbackEntry(card));
    }
  }

  const pasteLines = [...productParts, ...fallbackLines];
  const pasteText = pasteLines.join("\n");

  let url: string | null = null;
  if (productParts.length > 0) {
    const params = new URLSearchParams();
    params.set("productline", TCGPLAYER_PRODUCT_LINE);
    params.set("c", productParts.join("||"));
    const candidate = `${TCGPLAYER_MASS_ENTRY_BASE}?${params.toString()}`;
    if (candidate.length <= MASS_ENTRY_URL_MAX_LEN) {
      url = candidate;
    }
  }

  return {
    pasteText,
    url,
    includedCount: included.length,
    copyCount,
    withProductId: productParts.length,
    missingProductId: fallbackLines.length,
  };
}

export function blankMassEntryUrl(): string {
  const params = new URLSearchParams();
  params.set("productline", TCGPLAYER_PRODUCT_LINE);
  return `${TCGPLAYER_MASS_ENTRY_BASE}?${params.toString()}`;
}
