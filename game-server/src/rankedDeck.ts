import { deckConstructionErrors, ensureDefsForPlayers, unsupportedCardsForDeck } from "@optcg/rules";
import { bad, type PlayerDeckWire } from "./protocol.js";

export function assertKnownDeck(deck: PlayerDeckWire): void {
  try {
    ensureDefsForPlayers([deck]);
  } catch (e) {
    throw bad(`Deck rejected: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function rankedDeckProblem(deck: PlayerDeckWire): string | null {
  const issues = unsupportedCardsForDeck(deck);
  if (issues.length > 0) {
    return `Ranked deck contains unsupported cards: ${issues.map((issue) => `${issue.cardId} (${issue.support})`).join(", ")}`;
  }
  const [illegal] = deckConstructionErrors(deck.leaderId, deck.deck);
  return illegal ? `Ranked deck is not legal: ${illegal}` : null;
}
