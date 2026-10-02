/**
 * Deck input for the analyst: pasted lists (OPTCGSim `4xOP01-006`, Limitless `4 OP01-006`,
 * most "qty + card number" variants), planner share links, or a structured list.
 */
import { normalizeStatsCardId, type DeckStatsCard } from "@optcg/deck-analytics";
import type { Catalog } from "./catalog";

export type Deck = {
  name?: string;
  leaderId: string | null;
  /** Main deck, leader excluded, merged by card number. */
  cards: DeckStatsCard[];
  /** Card numbers that are not in the catalog (left out of `cards`). */
  unknown: string[];
  warnings: string[];
};

export type DeckInput = {
  text?: string;
  shareLink?: string;
  leaderId?: string;
  cards?: DeckStatsCard[];
};

const CARD_ID = /\b(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})(?:_[PR]\d+)?\b/i;

/** Quantity and card number from one line, or null when the line names no card. */
export function parseDeckLine(raw: string): { id: string; copies: number } | null {
  // OPTCGSim glues the count to the number ("4xOP01-006"); split it so the id starts on a word boundary.
  const line = raw.replace(/^(\s*\d+)x(?=[A-Z])/i, "$1x ");
  const m = CARD_ID.exec(line);
  if (!m) return null;
  const id = normalizeStatsCardId(m[1]!);
  const before = line.slice(0, m.index).trim();
  const after = line.slice(m.index + m[0].length).trim();
  const lead = /^(\d+)\s*x?\b/i.exec(before) ?? /^(\d+)x$/i.exec(before);
  const trail = /(?:^|\s)x?\s*(\d+)\s*$/i.exec(after);
  const copies = Number(lead?.[1] ?? trail?.[1] ?? 1);
  return { id, copies };
}

/** Builds a deck from card lines. The first leader seen is the leader; the rest is the main deck. */
export function deckFromLines(catalog: Catalog, entries: readonly { id: string; copies: number }[], leaderHint?: string | null): Deck {
  const warnings: string[] = [];
  const unknown = new Set<string>();
  const copies = new Map<string, number>();
  let leaderId = leaderHint ? normalizeStatsCardId(leaderHint) : null;
  if (leaderId && catalog.cards.get(leaderId)?.type !== "leader") {
    warnings.push(`${leaderId} is not a known leader.`);
    leaderId = null;
  }
  for (const e of entries) {
    if (!(e.copies > 0)) continue;
    const id = normalizeStatsCardId(e.id);
    const card = catalog.cards.get(id);
    if (!card) {
      unknown.add(id);
      continue;
    }
    if (card.type === "leader") {
      if (!leaderId) leaderId = id;
      else if (leaderId !== id) warnings.push(`Extra leader ${id} (${card.name}) was ignored; the leader is ${leaderId}.`);
      continue;
    }
    copies.set(id, (copies.get(id) ?? 0) + e.copies);
  }
  if (!leaderId) warnings.push("No leader found. Add a line such as 1xOP01-001.");
  if (unknown.size) warnings.push(`Unknown card numbers left out: ${[...unknown].join(", ")}.`);
  const cards = [...copies].map(([id, n]) => ({ id, copies: n })).sort((a, b) => a.id.localeCompare(b.id));
  return { leaderId, cards, unknown: [...unknown], warnings };
}

export function parseDeckText(catalog: Catalog, text: string, leaderHint?: string | null): Deck {
  const entries: { id: string; copies: number }[] = [];
  for (const raw of text.split(/\r?\n|;|,(?=\s*\d)/)) {
    const line = raw.replace(/(#|\/\/).*$/, "").trim();
    if (!line) continue;
    const parsed = parseDeckLine(line);
    if (parsed) entries.push(parsed);
  }
  return deckFromLines(catalog, entries, leaderHint);
}

/** Share token from a planner share URL (…/share/<token>) or a bare token. */
export function shareToken(link: string): string | null {
  const m = /\/share\/([A-Za-z0-9_-]+)/.exec(link) ?? /^([A-Za-z0-9_-]{8,})$/.exec(link.trim());
  return m?.[1] ?? null;
}

type PublicShare = {
  kind?: string;
  deck_name?: string | null;
  items?: { card_id: string; name?: string; card_type?: string; need: number; primary_leader_card_id?: string | null }[];
};

export const PLANNER_API_URL = process.env.PLANNER_API_URL ?? "https://optcg-deck-planner.app/api";

export async function fetchSharedDeck(catalog: Catalog, link: string, fetchImpl: typeof fetch = fetch): Promise<Deck> {
  const token = shareToken(link);
  if (!token) throw new Error("That doesn't look like a deck planner share link (expected …/share/<token>).");
  const res = await fetchImpl(`${PLANNER_API_URL}/public/share/${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new Error("That share link was not found or has been turned off.");
  if (!res.ok) throw new Error(`The deck planner returned ${res.status} for that share link.`);
  const body = (await res.json()) as PublicShare;
  if (body.kind !== "deck") throw new Error("That link shares a shopping list, not a single deck. Share the deck itself from its deck page.");
  // DON!! cards are tracked in the planner but are not part of the main deck.
  const isDon = (i: { card_id: string; name?: string; card_type?: string }) =>
    /^DON-/i.test(i.card_id) || /DON!!/i.test(i.name ?? "") || /\bDON\b/i.test(i.card_type ?? "");
  const items = (body.items ?? []).filter((i) => !isDon(i));
  const leaderHint = items.find((i) => i.primary_leader_card_id)?.primary_leader_card_id ?? null;
  const deck = deckFromLines(catalog, items.map((i) => ({ id: i.card_id, copies: i.need })), leaderHint);
  return { ...deck, name: body.deck_name ?? undefined };
}

export async function resolveDeck(catalog: Catalog, input: DeckInput, fetchImpl?: typeof fetch): Promise<Deck> {
  if (input.shareLink) return fetchSharedDeck(catalog, input.shareLink, fetchImpl);
  if (input.text) return parseDeckText(catalog, input.text, input.leaderId);
  if (input.cards?.length) return deckFromLines(catalog, input.cards, input.leaderId);
  throw new Error("Give a deck as text, a planner share link, or a card list.");
}

/** Deck list text in OPTCGSim's import format (leader first) or Limitless's (`4 OP01-006`). */
export function exportDeck(deck: Deck, format: "optcgsim" | "limitless"): string {
  const line = (n: number, id: string) => (format === "optcgsim" ? `${n}x${id}` : `${n} ${id}`);
  const lines = deck.leaderId ? [line(1, deck.leaderId)] : [];
  for (const c of deck.cards) lines.push(line(c.copies, c.id));
  return lines.join("\n");
}
