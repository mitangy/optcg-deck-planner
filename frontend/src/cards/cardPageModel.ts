import type { CardPageFinish, CardPageLeader, CardPagePrinting, CardPageUsage } from "../api";
import { artLabel } from "../prices/priceHistoryModel";
import { formatPercent, META_DAY_OPTIONS, META_DEFAULT_DAYS } from "../meta/meta";

export function parseArt(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function selectPrinting(
  printings: readonly CardPagePrinting[],
  art: number,
): { printing: CardPagePrinting | null; productId: number } {
  const base = printings[0] ?? null;
  const picked = art > 0 && base && art !== base.product_id ? printings.find((p) => p.product_id === art) : undefined;
  return picked ? { printing: picked, productId: picked.product_id } : { printing: base, productId: 0 };
}

const COLLECTOR_MARK = /\s*\(\s*(?:[A-Za-z]{1,4}\d{2}-)?\d{1,3}[A-Za-z]?\s*\)/g;

export function printingLabel(printing: CardPagePrinting, index: number): string {
  if (index === 0) return "Base";
  const marks = artLabel(printing.name.replace(COLLECTOR_MARK, ""));
  return marks === "base art" ? `Alt art ${index}` : marks;
}

export function cardFacts(card: { rarity: string; color: string; card_type: string; cost: string | null }): string[] {
  const facts = [card.card_type, card.color ? card.color.replace(/;/g, "/") : "", card.cost ? `Cost ${card.cost}` : ""];
  return facts.filter(Boolean);
}

export function leaderPlayLine(l: Pick<CardPageLeader, "decks_with_card" | "leader_decks" | "rate">): string {
  return `${l.decks_with_card} of ${l.leader_decks} ${l.leader_decks === 1 ? "deck" : "decks"} · ${formatPercent(l.rate)}`;
}

export function usageHeadline(u: Pick<CardPageUsage, "is_leader" | "decks_with_card" | "total_decks" | "rate" | "days">): string {
  if (u.total_decks === 0) return `No tournament decklists in the last ${u.days} days.`;
  if (u.decks_with_card === 0) return `Not played in the last ${u.days} days (${u.total_decks.toLocaleString("en-US")} decks).`;
  const what = u.is_leader ? "of decks led by it" : "of decklists";
  return `${formatPercent(u.rate)} ${what} (${u.decks_with_card.toLocaleString("en-US")} of ${u.total_decks.toLocaleString("en-US")})`;
}

export function parseDays(raw: string | null): number {
  const n = Number(raw);
  return (META_DAY_OPTIONS as readonly number[]).includes(n) ? n : META_DEFAULT_DAYS;
}
