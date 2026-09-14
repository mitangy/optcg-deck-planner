/** Parse TCGPlayer product id from CDN image URLs (`…/product/{id}_…`). */
const PRODUCT_ID_FROM_URL_RE = /product\/(\d+)_/i;

export function productIdFromImageUrl(url: string | undefined | null): number | undefined {
  if (!url) return undefined;
  const m = url.match(PRODUCT_ID_FROM_URL_RE);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
