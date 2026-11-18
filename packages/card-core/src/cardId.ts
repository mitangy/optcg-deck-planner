// No dependencies: rules cannot import `ui`, and duel-web's main bundle cannot import rules.

export const MAIN_DECK_SIZE = 50;

export const CARD_ID_RE = /^[A-Z0-9]+-\d+[A-Z]?$/;

const ART_SUFFIX_RE = /_(?:P\d+|R\d+)$/;

export function normalizeCardId(id: string): string {
  return id.trim().toUpperCase().replace(ART_SUFFIX_RE, "");
}

export function isCardId(id: string): boolean {
  return CARD_ID_RE.test(id.trim().toUpperCase());
}
