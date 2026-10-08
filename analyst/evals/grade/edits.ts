/**
 * For build questions: apply the answer's +N/-N lines to the deck that was asked about and check the
 * result with the same analysis the model calls (legal, exactly 50 cards, plus the ban list when given).
 */
import { analyzeDeck } from "../../src/analysis";
import type { Catalog } from "../../src/catalog";
import { deckFromLines, parseDeckText } from "../../src/decks";
import { extractFacts } from "./extract";

export type EditCheck = { applied: number; legal: boolean; problems: string[] };

export function checkEdits(catalog: Catalog, deckText: string, answer: string, extraProblems: (cards: { id: string; copies: number }[], leaderId: string | null) => string[] = () => []): EditCheck {
  const edits = extractFacts(answer).edits;
  if (!edits.length) return { applied: 0, legal: false, problems: ["the answer has no +N/-N lines to apply"] };
  const deck = parseDeckText(catalog, deckText);
  const copies = new Map(deck.cards.map((c) => [c.id, c.copies]));
  for (const e of edits) copies.set(e.id, Math.max(0, (copies.get(e.id) ?? 0) + (e.sign === "+" ? e.copies : -e.copies)));
  const edited = deckFromLines(catalog, [...copies].map(([id, n]) => ({ id, copies: n })), deck.leaderId);
  const analysis = analyzeDeck(catalog, edited);
  const problems = [
    ...analysis.hints.filter((h) => h.tier === "rule").map((h) => `${h.title}${h.cardIds?.length ? ` (${h.cardIds.join(", ")})` : ""}`),
    ...extraProblems(edited.cards, edited.leaderId),
    ...edited.unknown.map((id) => `${id} is not a card`),
  ];
  return { applied: edits.length, legal: analysis.legal && problems.length === 0, problems };
}
