import { createSeededRng } from "./rng.js";
import type { MatchState } from "./types.js";

/**
 * Restart the match rng from `seed` and, with `shuffleDecks`, reshuffle both
 * Decks (the deck zone only; Life and hands stay as they are). The room does
 * this after an agreed undo so the order both players just saw is no longer
 * the real one, and replayMatch repeats it at the same point (#369).
 */
export function reseedMatch(state: MatchState, seed: number, shuffleDecks: boolean): MatchState {
  const next = structuredClone(state) as MatchState;
  const rng = createSeededRng(seed >>> 0);
  if (shuffleDecks) {
    for (const p of next.players) {
      const cards = rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
      p.deck = cards.map((c) => c.defId);
      p.zoneInstanceIds.deck = cards.map((c) => c.id);
    }
  }
  next.rng = rng.snapshot();
  return next;
}
