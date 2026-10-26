/**
 * The planner's FastAPI backend (the little the deck page needs), answered in the browser through `FakeOptions.extra`.
 * Card names, costs and art come from the real card data in duel-web; owned counts, rarities and market prices are
 * invented for the trailer (they are not real TCGplayer prices).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Route } from "playwright";
import { REPO_DIR, WEB_ORIGIN } from "./env";
import type { DeckList } from "./data";
import type { Person } from "./fakeApi";

type CatalogRow = { id: string; name: string; type: string; colors?: string[]; cost?: number; productId?: number; imageUrl?: string };
const assets = join(REPO_DIR, "duel-web/src/assets");
const atlas = JSON.parse(readFileSync(join(assets, "cardAtlas.json"), "utf8")) as Record<string, CatalogRow>;
const catalog = JSON.parse(readFileSync(join(assets, "cardCatalog.json"), "utf8")) as Record<string, CatalogRow>;

const COLOR: Record<string, string> = { red: "Red", green: "Green", blue: "Blue", purple: "Purple", black: "Black", yellow: "Yellow" };
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Rarity by cost, a stand-in: the duel data carries no rarity. Price by rarity with a per-card wobble. */
function rarityOf(row: CatalogRow, leader: boolean): string {
  if (leader) return "L";
  const c = row.cost ?? 0;
  return c <= 2 ? "C" : c === 3 ? "UC" : c === 4 ? "R" : "SR";
}
function priceOf(id: string, rarity: string): number {
  const base = { L: 4.9, C: 0.18, UC: 0.35, R: 1.1, SR: 3.4 }[rarity] ?? 0.5;
  const wobble = 0.75 + (hash(id) % 60) / 100;
  return Math.round(base * wobble * 100) / 100;
}
/** The art the duel board shows: a bundled print when there is one, else the TCGplayer image of the same card. */
function imageFor(row: CatalogRow): string {
  const local = atlas[row.id]?.imageUrl ?? "";
  if (local.startsWith("/") && existsSync(join(REPO_DIR, "duel-web/public", local))) return `${WEB_ORIGIN}${local}`;
  const url = catalog[row.id]?.imageUrl ?? (local.startsWith("http") ? local : "");
  return url.replace("_400w", "_200w");
}

export function plannerDeck(id: number, name: string, deck: DeckList, ownedShare = 0.6) {
  const counts = new Map<string, number>();
  for (const c of deck.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  const mk = (cardId: string, needed: number, leader: boolean) => {
    const row = { ...catalog[cardId], ...atlas[cardId], id: cardId } as CatalogRow;
    const rarity = rarityOf(row, leader);
    const price = priceOf(cardId, rarity);
    const h = hash(cardId);
    const owned = leader ? 1 : Math.min(needed, Math.floor(needed * ownedShare + (h % 3 === 0 ? 1 : 0)));
    return {
      card_id: cardId, name: row.name, rarity, color: COLOR[row.colors?.[0] ?? ""] ?? "Red", card_type: leader ? "Leader" : row.type === "event" ? "Event" : row.type === "stage" ? "Stage" : "Character",
      cost: leader ? null : (row.cost ?? 0), needed, owned, alts_owned: 0, still_need: Math.max(0, needed - owned),
      market_price: price, low_price: Math.round(price * 0.82 * 100) / 100, image_url: imageFor(row), tcgplayer_url: row.productId ? `https://www.tcgplayer.com/product/${row.productId}` : "",
      product_id: row.productId ?? null, section: "main", alt_arts: [], display_art: null as number | null,
    };
  };
  const cards = [mk(deck.leaderId, 1, true), ...[...counts].map(([c, n]) => mk(c, n, false))];
  const main = cards.reduce((s, c) => s + c.needed, 0);
  return {
    detail: { id, name, leader_card_id: deck.leaderId, leader_name: atlas[deck.leaderId]?.name ?? null, prior_decks: [] as string[], is_main: true, cards, main_cards: main, don_cards: 0, hidden_from_friends: false },
    summary: { id, name, leader_card_id: deck.leaderId, leader_name: atlas[deck.leaderId]?.name ?? null, leader_image_url: imageFor({ ...atlas[deck.leaderId]!, id: deck.leaderId }), card_count: cards.length, total_cards: main, main_cards: main, don_cards: 0, owned_copies: cards.reduce((s, c) => s + c.owned, 0), sort_order: 0, is_main: true },
  };
}

const SALES = (price: number) => [
  { price: Math.round(price * 1.04 * 100) / 100, shipping: 0.99, condition: "Near Mint", variant: "Normal", language: "English", quantity: 1, order_date: new Date(Date.now() - 1 * 86_400_000).toISOString() },
  { price: Math.round(price * 0.96 * 100) / 100, shipping: 0.99, condition: "Near Mint", variant: "Normal", language: "English", quantity: 2, order_date: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { price: Math.round(price * 0.9 * 100) / 100, shipping: 0.99, condition: "Lightly Played", variant: "Normal", language: "English", quantity: 1, order_date: new Date(Date.now() - 6 * 86_400_000).toISOString() },
];

export function plannerExtra(me: Person, deckPair: ReturnType<typeof plannerDeck>, cors: (origin: string | undefined) => Record<string, string>) {
  return async (route: Route, path: string): Promise<boolean> => {
    const headers = cors(route.request().headers()["origin"]);
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers, json: body as object }).then(() => true);
    if (path === "/auth/me") return json({ id: me.uid, email: `${me.name.toLowerCase()}@example.invalid`, name: me.name, username: me.name, role: "user", sum_across_leaders: false });
    if (path === "/decks") return json([deckPair.summary]);
    if (path === `/decks/${deckPair.detail.id}`) return json(deckPair.detail);
    const sales = path.match(/^\/catalog\/sales\/(\d+)$/);
    if (sales) {
      const card = deckPair.detail.cards.find((c) => String(c.product_id) === sales[1]);
      return json({ product_id: Number(sales[1]), sales: SALES(card?.market_price ?? 1) });
    }
    if (path === "/shopping") return json({ items: [], cards_still_needed: 0, remaining_market: 0, unique_cards: 0 });
    return false;
  };
}
