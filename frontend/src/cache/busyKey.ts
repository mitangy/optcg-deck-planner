export function busyKeyFor(cardId: string, productId: number): string {
  return `${cardId}:${productId}`;
}

export function busyProductFor(key: string | null | undefined, cardId: string): number | null {
  return key?.startsWith(`${cardId}:`) ? Number(key.slice(cardId.length + 1)) : null;
}
