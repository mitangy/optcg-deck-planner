import { DECK_NAME_MAX, META_DEFAULT_DAYS, formatDeckRow, formatMetaDate, formatPercent, metaDeckName, ordinal } from "@optcg/deck-analytics/metaFormat";
import type { MetaDeck, MetaDeckCard, MetaLeader } from "../api";

export { DECK_NAME_MAX, META_DEFAULT_DAYS, formatDeckRow, formatMetaDate, formatPercent, metaDeckName, ordinal };

export const META_DAY_OPTIONS = [7, 14, 30] as const;

export type CostGroup = { label: string; cards: MetaDeckCard[] };

export function groupCardsByCost(cards: MetaDeckCard[]): CostGroup[] {
  const byCost = new Map<number, MetaDeckCard[]>();
  const other: MetaDeckCard[] = [];
  for (const card of cards) {
    const cost = card.cost.trim() === "" ? NaN : Number(card.cost);
    if (Number.isNaN(cost)) {
      other.push(card);
      continue;
    }
    const list = byCost.get(cost) ?? [];
    list.push(card);
    byCost.set(cost, list);
  }
  const groups = [...byCost.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cost, list]) => ({ label: `Cost ${cost}`, cards: list }));
  if (other.length) groups.push({ label: "Other", cards: other });
  return groups;
}

export type CreateMetaDeckDeps = {
  createDeck: (name: string, decklist: string) => Promise<{ id: number }>;
  onCreated: () => Promise<unknown> | unknown;
  navigate: (path: string) => void;
};

export async function createMetaDeck(
  leader: { id: string; name: string },
  deck: Pick<MetaDeck, "placing" | "event" | "text">,
  deps: CreateMetaDeckDeps,
): Promise<number> {
  const created = await deps.createDeck(metaDeckName(leader.name, leader.id, deck), deck.text);
  await deps.onCreated();
  deps.navigate(`/decks/${created.id}`);
  return created.id;
}

/** Fewer decks than this and a leader's win rate is too noisy to trust (#1359). */
export const META_MIN_DECKS_FOR_WIN_RATE = 20;

export function hasFewDecks(leader: { decks: number }): boolean {
  return leader.decks < META_MIN_DECKS_FOR_WIN_RATE;
}

export function fewDecksNote(leader: { decks: number }): string {
  return `Only ${leader.decks} ${leader.decks === 1 ? "deck" : "decks"}, so this win rate can swing a lot`;
}

export const META_SORTS = ["share", "win_rate", "top8", "decks"] as const;
export type MetaSort = (typeof META_SORTS)[number];
export const META_DEFAULT_SORT: MetaSort = "share";
export const META_SORT_LABELS: Record<MetaSort, string> = { share: "Share", win_rate: "Win rate", top8: "Top 8", decks: "Decks" };

export function parseMetaSort(raw: string | null): MetaSort {
  return (META_SORTS as readonly string[]).includes(raw ?? "") ? (raw as MetaSort) : META_DEFAULT_SORT;
}

export type MetaLeaderFilter = { q: string; colors: string[]; sort: MetaSort };

function leaderColors(color: string): string[] {
  return color
    .split(/[;/,&]+/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/** Search (name or ID), colour chips (any colour of a two-colour leader matches) and a descending sort. */
export function filterSortLeaders(leaders: MetaLeader[], { q, colors, sort }: MetaLeaderFilter): MetaLeader[] {
  const needle = q.trim().toLowerCase();
  const picked = colors.map((c) => c.toLowerCase());
  const shown = leaders.filter((l) => {
    if (needle && !l.name.toLowerCase().includes(needle) && !l.leader_id.toLowerCase().includes(needle)) return false;
    if (picked.length && !leaderColors(l.color).some((c) => picked.includes(c))) return false;
    return true;
  });
  const value = (l: MetaLeader): number => (sort === "win_rate" ? (l.win_rate ?? -1) : l[sort]);
  return shown.sort((a, b) => {
    if (sort === "win_rate" && hasFewDecks(a) !== hasFewDecks(b)) return hasFewDecks(a) ? 1 : -1;
    return value(b) - value(a) || b.share - a.share || a.leader_id.localeCompare(b.leader_id);
  });
}

/** The line under a leader's name on its own page: its numbers when known, else just the window. */
export function leaderSubtitle(leader: { decks: number; top8: number } | undefined, days: number): string {
  if (!leader) return `last ${days} days`;
  return `${leader.decks.toLocaleString("en-US")} ${leader.decks === 1 ? "deck" : "decks"} · ${leader.top8.toLocaleString("en-US")} top 8 · last ${days} days`;
}

/**
 * The cards in a list that set it apart from the leader's other loaded lists: presence is the fraction of lists that
 * run the card, only cards under half qualify, rarest first (then more copies, then card id).
 */
export function distinctiveCards(deck: Pick<MetaDeck, "cards">, allDecks: Pick<MetaDeck, "cards">[], max = 5): MetaDeckCard[] {
  if (allDecks.length < 3) return [];
  const lists = new Map<string, number>();
  for (const d of allDecks) for (const id of new Set(d.cards.map((c) => c.card_id))) lists.set(id, (lists.get(id) ?? 0) + 1);
  const presence = (c: MetaDeckCard) => (lists.get(c.card_id) ?? 0) / allDecks.length;
  return deck.cards
    .filter((c) => presence(c) < 0.5)
    .sort((a, b) => presence(a) - presence(b) || b.count - a.count || a.card_id.localeCompare(b.card_id))
    .slice(0, max);
}
