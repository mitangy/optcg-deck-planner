
export const TCGPLAYER_MASS_ENTRY_BASE = "https://www.tcgplayer.com/massentry";
export const TCGPLAYER_PRODUCT_LINE = "One Piece Card Game";

export const MASS_ENTRY_URL_MAX_LEN = 1800;

export type MassEntryCard = {
  card_id: string;
  name: string;
  still_need: number;
  product_id?: number | null;
};

export type MassEntryExport = {
  pasteText: string;
  url: string | null;
  includedCount: number;
  copyCount: number;
  withProductId: number;
  missingProductId: number;
};

function productEntry(qty: number, productId: number): string {
  return `${qty}-${productId}`;
}

function nameFallbackEntry(card: MassEntryCard, qty: number): string {
  const name = (card.name || card.card_id).trim();
  return `${qty} ${name} ${card.card_id}`.trim();
}

export function buildMassEntryExport(cards: MassEntryCard[]): MassEntryExport {
  const included = cards.filter((c) => c.still_need > 0);
  const productParts: string[] = [];
  const fallbackLines: string[] = [];
  let copyCount = 0;
  let withProductId = 0;
  let missingProductId = 0;

  for (const card of included) {
    copyCount += card.still_need;
    const buys = [
      {
        product_id: card.product_id != null && card.product_id > 0 ? card.product_id : null,
        qty: card.still_need,
      },
    ];
    let cardHasProduct = false;
    let cardHasFallback = false;
    for (const buy of buys) {
      if (buy.product_id != null && buy.product_id > 0) {
        productParts.push(productEntry(buy.qty, buy.product_id));
        cardHasProduct = true;
      } else {
        fallbackLines.push(nameFallbackEntry(card, buy.qty));
        cardHasFallback = true;
      }
    }
    if (cardHasProduct) withProductId += 1;
    if (cardHasFallback) missingProductId += 1;
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
    withProductId,
    missingProductId,
  };
}

export function blankMassEntryUrl(): string {
  const params = new URLSearchParams();
  params.set("productline", TCGPLAYER_PRODUCT_LINE);
  return `${TCGPLAYER_MASS_ENTRY_BASE}?${params.toString()}`;
}
