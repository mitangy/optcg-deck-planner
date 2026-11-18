import { createSeededRng } from "../rng.js";
import type { MatchState } from "../types.js";

/**
 * The room does this after an agreed undo so the order both players just saw is no longer the real one, and
 * replayMatch repeats it at the same point.
 */
export function reseedMatch(state: MatchState, seed: number, shuffleDecks: boolean): MatchState {
  const next = structuredClone(state) as MatchState;
  const rng = createSeededRng(state.rng.key ? { seed: seed >>> 0, cursor: 0, key: state.rng.key } : seed >>> 0);
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
