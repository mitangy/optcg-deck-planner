/** The key a save in flight is tracked under: one alt printing of one card. */
export function busyKeyFor(cardId: string, productId: number): string {
  return `${cardId}:${productId}`;
}

/** The product id in a `${cardId}:${productId}` busy key when it belongs to this card. */
export function busyProductFor(key: string | null | undefined, cardId: string): number | null {
  return key?.startsWith(`${cardId}:`) ? Number(key.slice(cardId.length + 1)) : null;
}
