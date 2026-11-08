import type { CardPageFinish, CardPageLeader, CardPagePrinting, CardPageUsage } from "../api";
import { artLabel } from "../prices/priceHistoryModel";
import { formatPercent, META_DAY_OPTIONS, META_DEFAULT_DAYS } from "../meta/meta";

/** `?art=` as a product id; anything that is not a positive whole number means the base art (0). */
export function parseArt(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * The printing the page shows for `?art=`, and the product id the price panel charts (0 = base).
 * The first printing is the base art; an id the card does not have falls back to it.
 */
export function selectPrinting(
  printings: readonly CardPagePrinting[],
  art: number,
): { printing: CardPagePrinting | null; productId: number } {
  const base = printings[0] ?? null;
  const picked = art > 0 && base && art !== base.product_id ? printings.find((p) => p.product_id === art) : undefined;
  return picked ? { printing: picked, productId: picked.product_id } : { printing: base, productId: 0 };
}

/** A collector number in parentheses, e.g. "(016)" or "(OP01-016)": part of the name, not an art mark. */
const COLLECTOR_MARK = /\s*\(\s*(?:[A-Za-z]{1,4}\d{2}-)?\d{1,3}[A-Za-z]?\s*\)/g;

/** Short tile label: "Base" for the first printing, else its art marks ("Alternate Art", "Manga"). */
export function printingLabel(printing: CardPagePrinting, index: number): string {
  if (index === 0) return "Base";
  const marks = artLabel(printing.name.replace(COLLECTOR_MARK, ""));
  return marks === "base art" ? `Alt art ${index}` : marks;
}

/** "Leader · Red · Cost 3": the facts under the card name that are known. */
export function cardFacts(card: { rarity: string; color: string; card_type: string; cost: string | null }): string[] {
  const facts = [card.card_type, card.color ? card.color.replace(/;/g, "/") : "", card.cost ? `Cost ${card.cost}` : ""];
  return facts.filter(Boolean);
}

/** "3 of 5 decks · 60.0%" */
export function leaderPlayLine(l: Pick<CardPageLeader, "decks_with_card" | "leader_decks" | "rate">): string {
  return `${l.decks_with_card} of ${l.leader_decks} ${l.leader_decks === 1 ? "deck" : "decks"} · ${formatPercent(l.rate)}`;
}

/** The headline under "Tournament play": how often the card shows up. A Leader reads as a meta share. */
export function usageHeadline(u: Pick<CardPageUsage, "is_leader" | "decks_with_card" | "total_decks" | "rate" | "days">): string {
  if (u.total_decks === 0) return `No tournament decklists in the last ${u.days} days.`;
  if (u.decks_with_card === 0) return `Not played in the last ${u.days} days (${u.total_decks.toLocaleString("en-US")} decks).`;
  const what = u.is_leader ? "of decks led by it" : "of decklists";
  return `${formatPercent(u.rate)} ${what} (${u.decks_with_card.toLocaleString("en-US")} of ${u.total_decks.toLocaleString("en-US")})`;
}

/** `?days=` as a tournament window the meta pages offer; anything else is the default. */
export function parseDays(raw: string | null): number {
  const n = Number(raw);
  return (META_DAY_OPTIONS as readonly number[]).includes(n) ? n : META_DEFAULT_DAYS;
}
