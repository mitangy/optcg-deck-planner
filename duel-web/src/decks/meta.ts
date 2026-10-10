/** Meta deck browser (#443): Limitless tournament data from the backend's public /meta endpoints, plus the pure helpers the page uses. */
import { getApiBaseUrl } from "../config";
import { ApiError, fetchWithTimeout } from "../net/api";
import { createDeckFromInput, type ImportIntoDeckResult, type SavedDeck } from "./storage";

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
export const META_DEFAULT_DAYS = 30;
/** Same ceiling as the planner's deck name field. */
export const DECK_NAME_MAX = 200;

const TIMEOUT_MS = 15000;

async function metaJson<T>(path: string, timeoutMs: number): Promise<T> {
  const res = await fetchWithTimeout(`${getApiBaseUrl()}${path}`, { credentials: "include" }, timeoutMs);
  if (!res.ok) {
    let detail = `Meta request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export function fetchMetaLeaders(days: number, timeoutMs = TIMEOUT_MS): Promise<MetaLeadersResponse> {
  return metaJson(`/meta/leaders?days=${days}`, timeoutMs);
}

export function fetchMetaDecks(
  leaderId: string,
  days: number,
  top8Only: boolean,
  timeoutMs = TIMEOUT_MS,
): Promise<MetaDecksResponse> {
  const q = new URLSearchParams({ leader: leaderId, days: String(days), top: top8Only ? "8" : "0" });
  return metaJson(`/meta/decks?${q}`, timeoutMs);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "Silvers Rayleigh – 1st Weekly Cup", or "Silvers Rayleigh – Weekly Cup" with no placing. */
export function metaDeckName(
  leaderName: string,
  leaderId: string,
  event: string,
  placing: number | null,
): string {
  const lead = leaderName.trim() || leaderId;
  const tail = placing != null && placing > 0 ? `${ordinal(placing)} ${event.trim()}` : event.trim();
  return `${lead} – ${tail}`.trim().slice(0, DECK_NAME_MAX);
}

export function formatPercent(fraction: number | null): string {
  if (fraction == null) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" → "Oct 5", read as a calendar date so the viewer's time zone cannot shift it. */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`;
}

/** "1st of 64 · Weekly Cup · Oct 5 · 6-0-0" */
export function formatDeckRow(deck: MetaDeck): string {
  const place =
    deck.placing != null && deck.placing > 0
      ? `${ordinal(deck.placing)} of ${deck.players}`
      : `${deck.players} players`;
  const { wins, losses, ties } = deck.record;
  return [place, deck.event, formatShortDate(deck.date), `${wins}-${losses}-${ties}`].join(" · ");
}

/** Meta decks list the main deck only; the leader is separate. */
export function metaDeckCardIds(deck: MetaDeck): string[] {
  return deck.cards.flatMap((c) => Array.from({ length: c.count }, () => c.card_id));
}

/** Order-independent identity of a list: leader plus the sorted main deck. */
export function deckSignature(leaderId: string, cardIds: readonly string[]): string {
  return `${leaderId.toUpperCase()}|${[...cardIds].map((c) => c.toUpperCase()).sort().join(",")}`;
}

/** The saved deck holding exactly this list (same leader and cards), if any. */
export function findSavedCopy(saved: readonly SavedDeck[], leaderId: string, deck: MetaDeck): SavedDeck | undefined {
  const want = deckSignature(leaderId, metaDeckCardIds(deck));
  return saved.find((d) => deckSignature(d.leaderId, d.cards) === want);
}

/** Saves the deck's own paste text as a new local deck. */
export function addMetaDeck(leader: { leaderId: string; name: string }, deck: MetaDeck): ImportIntoDeckResult {
  return createDeckFromInput(metaDeckName(leader.name, leader.leaderId, deck.event, deck.placing), deck.text);
}

/** Cards grouped by cost for the expanded list ("0", "1", … then everything unpriced). */
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
