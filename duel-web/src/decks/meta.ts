import { DECK_NAME_MAX, META_DEFAULT_DAYS, formatDeckRow as formatMetaDeckRow, formatPercent, metaDeckName, ordinal } from "@optcg/deck-analytics/metaFormat";
import { apiCall, withTimeoutWording } from "../api/http";
import { createDeckFromInput, listSavedDecks, setSelectedDeckId, type ImportIntoDeckResult, type SavedDeck } from "./storage";

export { DECK_NAME_MAX, META_DEFAULT_DAYS, formatPercent, metaDeckName, ordinal };

export type MetaLeader = {
  leader_id: string;
  name: string;
  color: string;
  image_url: string;
  decks: number;
  share: number;
  top8: number;
  wins: number;
  losses: number;
  ties: number;
  win_rate: number | null;
};

export type MetaLeadersResponse = {
  days: number;
  min_players: number;
  events: number;
  total_decks: number;
  source: string;
  source_url: string;
  leaders: MetaLeader[];
};

export type MetaCard = {
  card_id: string;
  count: number;
  name: string;
  cost: string;
  card_type: string;
  image_url: string;
};

export type MetaDeck = {
  id: number;
  event_id: string;
  event: string;
  event_url: string;
  date: string;
  players: number;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  cards: MetaCard[];
  card_count: number;
  text: string;
};

export type MetaDecksResponse = {
  leader_id: string;
  name: string;
  image_url: string;
  decks: MetaDeck[];
};

export const META_WINDOWS = [7, 14, 30] as const;

const TIMEOUT_MS = 15000;

async function metaJson<T>(path: string, timeoutMs: number): Promise<T> {
  try {
    return await apiCall<T>(path, { timeoutMs }, "Meta request failed");
  } catch (e) {
    throw withTimeoutWording(e, timeoutMs);
  }
}

export function fetchMetaLeaders(days: number, timeoutMs = TIMEOUT_MS): Promise<MetaLeadersResponse> {
  return metaJson(`/meta/leaders?days=${days}`, timeoutMs);
}

export function fetchMetaDecks(
  leaderId: string,
  days: number,
  top8Only: boolean,
  timeoutMs = TIMEOUT_MS,
  limit?: number,
): Promise<MetaDecksResponse> {
  const q = new URLSearchParams({ leader: leaderId, days: String(days), top: top8Only ? "8" : "0" });
  if (limit) q.set("limit", String(limit));
  return metaJson(`/meta/decks?${q}`, timeoutMs);
}

export function formatDeckRow(deck: MetaDeck): string {
  return formatMetaDeckRow(deck, { event: true });
}

export function metaDeckCardIds(deck: MetaDeck): string[] {
  return deck.cards.flatMap((c) => Array.from({ length: c.count }, () => c.card_id));
}

export function deckSignature(leaderId: string, cardIds: readonly string[]): string {
  return `${leaderId.toUpperCase()}|${[...cardIds].map((c) => c.toUpperCase()).sort().join(",")}`;
}

export function findSavedCopy(saved: readonly SavedDeck[], leaderId: string, deck: MetaDeck): SavedDeck | undefined {
  const want = deckSignature(leaderId, metaDeckCardIds(deck));
  return saved.find((d) => deckSignature(d.leaderId, d.cards) === want);
}

export function addMetaDeck(leader: { leaderId: string; name: string }, deck: MetaDeck): ImportIntoDeckResult {
  return createDeckFromInput(metaDeckName(leader.name, leader.leaderId, deck), deck.text);
}

export function playMetaDeck(
  leader: { leaderId: string; name: string },
  deck: MetaDeck,
): { ok: true; deckId: string; warnings: string[] } | { ok: false; errors: string[] } {
  const existing = findSavedCopy(listSavedDecks(), leader.leaderId, deck);
  if (existing) {
    setSelectedDeckId(existing.id);
    return { ok: true, deckId: existing.id, warnings: [] };
  }
  const result = addMetaDeck(leader, deck);
  if (!result.ok) return { ok: false, errors: result.errors };
  setSelectedDeckId(result.deck.id);
  return { ok: true, deckId: result.deck.id, warnings: result.warnings };
}

export function groupByCost(cards: readonly MetaCard[]): { cost: string; cards: MetaCard[] }[] {
  const groups = new Map<string, MetaCard[]>();
  for (const c of cards) {
    const key = /^\d+$/.test(c.cost) ? String(Number(c.cost)) : "";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : Number(a) - Number(b)))
    .map(([cost, list]) => ({ cost, cards: list }));
}
