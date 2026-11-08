/** Printed gameplay fields of one card, from the rules package's card list (a subset of its CardDataRow). */
export type CardRules = {
  name: string;
  type: string;
  colors: string[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  traits: string[];
  attributes: string[];
  text: string;
  trigger: string;
};

let cards: Promise<Record<string, CardRules>> | null = null;

/**
 * The printed text of a card (#953). The list is ~1.2 MB, so it is its own chunk and only the card page loads it,
 * once. Null when the card is not in the list (a brand-new card) or the chunk failed to load.
 */
export async function loadCardRules(cardId: string): Promise<CardRules | null> {
  cards ??= import("../../../packages/rules/src/cards/cardData.json").then((m) => (m.default as unknown as { cards: Record<string, CardRules> }).cards);
  try {
    return (await cards)[cardId] ?? null;
  } catch {
    cards = null;
    return null;
  }
}
