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

export async function loadCardRules(cardId: string): Promise<CardRules | null> {
  cards ??= import("../../../packages/rules/src/cards/cardData.json").then((m) => (m.default as unknown as { cards: Record<string, CardRules> }).cards);
  try {
    return (await cards)[cardId] ?? null;
  } catch {
    cards = null;
    return null;
  }
}
