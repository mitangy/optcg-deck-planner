/**
 * The deck prior the bots use when the caller passes none (#635): the Limitless top-finish lists in deckPrior.json,
 * refreshed with `npm run export-deck-prior -- --in <meta-decks.json>` (run from packages/rules). The file stores each list as
 * { cardId: copies }, about 10 KB for 16 leaders, so the game-server bundle stays small.
 */
import { buildDeckPrior, type DeckPrior } from "./determinize.js";
import priorFile from "./deckPrior.json" with { type: "json" };

export type DeckPriorFile = Record<string, Record<string, number>[]>;

/** Expand the compact file into a DeckPrior. */
export function priorFromFile(file: DeckPriorFile): DeckPrior {
  const decks: { leaderId: string; deck: string[] }[] = [];
  for (const [leaderId, lists] of Object.entries(file)) {
    for (const counts of lists) decks.push({ leaderId, deck: Object.entries(counts).flatMap(([id, n]) => new Array<string>(n).fill(id)) });
  }
  return buildDeckPrior(decks);
}

/** Compact form of decklists (one entry per list), the inverse of `priorFromFile`. */
export function priorToFile(decks: readonly { leaderId: string; deck: readonly string[] }[]): DeckPriorFile {
  const out: DeckPriorFile = {};
  for (const d of decks) {
    const counts: Record<string, number> = {};
    for (const id of d.deck) counts[id] = (counts[id] ?? 0) + 1;
    (out[d.leaderId] ??= []).push(Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))));
  }
  return out;
}

export const DEFAULT_DECK_PRIOR: DeckPrior = priorFromFile(priorFile as DeckPriorFile);
