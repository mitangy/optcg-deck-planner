import { ensureDefsForPlayers, unsupportedCardsForDeck } from "@optcg/rules";
import type { PlayerDeckWire } from "./protocol.js";

/** Throw (code bad_protocol) when a deck names a card the engine has no definition for. */
export function assertKnownDeck(deck: PlayerDeckWire): void {
  try {
    ensureDefsForPlayers([deck]);
  } catch (e) {
    throw Object.assign(
      new Error(`Deck rejected: ${e instanceof Error ? e.message : String(e)}`),
      { code: "bad_protocol" as const },
    );
  }
}

/** Why a deck can't play ranked (cards the engine doesn't fully resolve), or null. */
export function rankedDeckProblem(deck: PlayerDeckWire): string | null {
  const issues = unsupportedCardsForDeck(deck);
  if (issues.length === 0) return null;
  return `Ranked deck contains unsupported cards: ${issues
    .map((issue) => `${issue.cardId} (${issue.support})`)
    .join(", ")}`;
}
