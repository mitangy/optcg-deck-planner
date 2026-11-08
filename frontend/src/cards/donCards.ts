export function isDonCardType(cardType: string | undefined | null): boolean {
  const t = (cardType || "").trim().toLowerCase();
  return t.startsWith("don") || t.includes("don!!");
}

export function isDonCard(card: { card_type?: string | null; card_id?: string }): boolean {
  if (isDonCardType(card.card_type)) return true;
  return (card.card_id || "").toUpperCase().startsWith("DON-");
}
