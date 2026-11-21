import { lookupCard } from "../cards/atlas";
import { MAX_MAIN_DECK_SIZE } from "./editDeck";
import { leaderDeckRuleErrors } from "./storage";

const norm = (s: string) => s.trim().toLowerCase();

/** A card is playable in a Leader's deck when any of its colours is one of the Leader's colours. */
export function sharesColour(leaderColors: readonly string[], cardColors: readonly string[]): boolean {
  if (leaderColors.length === 0 || cardColors.length === 0) return true;
  const wanted = leaderColors.map(norm);
  return cardColors.some((c) => wanted.includes(norm(c)));
}

/** How many main-deck copies share no colour with the Leader. */
export function offColourCount(leaderId: string, cards: readonly string[]): number {
  const leaderColors = lookupCard(leaderId).colors;
  return cards.filter((id) => !sharesColour(leaderColors, lookupCard(id).colors)).length;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Edward.Newgate · Ready to play", "… · 3 cards short", "… · 2 cards over · 1 off-colour card". */
export function deckSubtitle(leaderId: string, cards: readonly string[]): string {
  const off = offColourCount(leaderId, cards);
  const ruleBroken = leaderDeckRuleErrors(leaderId, cards).length > 0;
  const parts = [lookupCard(leaderId).name];
  const diff = cards.length - MAX_MAIN_DECK_SIZE;
  if (diff < 0) parts.push(`${plural(-diff, "card", "cards")} short`);
  else if (diff > 0) parts.push(`${plural(diff, "card", "cards")} over`);
  else if (off === 0 && !ruleBroken) parts.push("Ready to play");
  else parts.push(`${MAX_MAIN_DECK_SIZE} cards`);
  if (off > 0) parts.push(plural(off, "off-colour card", "off-colour cards"));
  if (ruleBroken) parts.push("Leader rule broken");
  return parts.join(" · ");
}
