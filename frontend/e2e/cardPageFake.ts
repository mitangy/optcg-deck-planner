/** A fake card page API (#953): /meta/cards/:id and per-art price history, registered over the planner fixture's routes. */
import type { Page } from "@playwright/test";
import type { CardPageResponse, PriceHistoryResponse } from "../src/api";
import { chaseCardHistory } from "./fixtures";

const CDN = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`;

export const ZORO = "OP01-025";
export const LEADER = "OP01-001";

const finish = (id: number, placing: number | null, event: string, players: number, leader: [string, string, number], copies: number) => ({
  id,
  event,
  event_url: `https://play.limitlesstcg.com/tournament/${id}`,
  date: "2026-01-10",
  players,
  placing,
  record: { wins: placing ? 7 : 4, losses: placing ? 1 : 3, ties: 0 },
  leader_id: leader[0],
  leader_name: leader[1],
  leader_image_url: CDN(leader[2]),
  copies,
});

const characterPage = (days: number): CardPageResponse => ({
  card: {
    card_id: ZORO,
    name: "Roronoa Zoro",
    rarity: "SR",
    color: "Red",
    card_type: "Character",
    cost: "3",
    group_name: "Romance Dawn",
    image_url: CDN(5001),
    tcgplayer_url: "https://www.tcgplayer.com/product/5001",
    market_price: 18.5,
  },
  printings: [
    { product_id: 5001, name: "Roronoa Zoro", market_price: 18.5, image_url: CDN(5001), tcgplayer_url: "https://www.tcgplayer.com/product/5001", group_name: "Romance Dawn", is_special: false },
    { product_id: 5002, name: "Roronoa Zoro (Alternate Art)", market_price: 64.99, image_url: CDN(5002), tcgplayer_url: "https://www.tcgplayer.com/product/5002", group_name: "Romance Dawn", is_special: true },
    { product_id: 5003, name: "Roronoa Zoro (025) (Manga)", market_price: 410, image_url: CDN(5003), tcgplayer_url: "https://www.tcgplayer.com/product/5003", group_name: "Romance Dawn", is_special: true },
  ],
  usage: {
    days,
    min_players: 8,
    events: 39,
    total_decks: 1481,
    is_leader: false,
    decks_with_card: 412,
    rate: 0.278,
    average_copies: 3.6,
    leaders: [
      { leader_id: "OP01-001", name: "Roronoa Zoro", color: "Red", image_url: CDN(6001), leader_decks: 164, decks_with_card: 150, rate: 0.915, average_copies: 3.9 },
      { leader_id: "OP13-002", name: "Portgas.D.Ace", color: "Red", image_url: CDN(6002), leader_decks: 128, decks_with_card: 61, rate: 0.477, average_copies: 3.2 },
      { leader_id: "ST01-001", name: "Monkey.D.Luffy", color: "Red", image_url: CDN(6003), leader_decks: 90, decks_with_card: 22, rate: 0.244, average_copies: 2.4 },
    ],
    top_decks: [
      finish(101, 1, "[OP13] Regional Championship Tokyo", 256, ["OP01-001", "Roronoa Zoro", 6001], 4),
      finish(102, 2, "ChinoizeCup #115 Monday", 128, ["OP13-002", "Portgas.D.Ace", 6002], 4),
      finish(103, 4, "Weekly Cup", 64, ["OP01-001", "Roronoa Zoro", 6001], 3),
      finish(104, null, "Sunday Showdown", 32, ["ST01-001", "Monkey.D.Luffy", 6003], 2),
    ],
    source: "Limitless TCG",
    source_url: "https://play.limitlesstcg.com/tournaments/completed?game=OP",
  },
});

const leaderPage = (days: number) => {
  const c = characterPage(days);
  return {
    ...c,
    card: { ...c.card, card_id: LEADER, name: "Roronoa Zoro", card_type: "Leader", cost: null, rarity: "L" },
    printings: c.printings.slice(0, 1),
    usage: { ...c.usage, is_leader: true, decks_with_card: 164, rate: 0.111, average_copies: null, leaders: [], top_decks: c.usage.top_decks.filter((d) => d.leader_id === LEADER) },
  };
};

/** Shifts and scales the chase-card history so each art charts a different price. */
function history(productId: number): PriceHistoryResponse {
  const scale = productId === 5002 ? 0.7 : productId === 5003 ? 4.5 : 0.2;
  const current = productId === 5002 ? 64.99 : productId === 5003 ? 410 : 18.5;
  const points = chaseCardHistory(120).map(([d, v]): [string, number] => [d, Math.round(v * scale * 100) / 100]);
  const name = productId === 5002 ? "Roronoa Zoro (Alternate Art)" : productId === 5003 ? "Roronoa Zoro (025) (Manga)" : "Roronoa Zoro";
  return { card_id: ZORO, product_id: productId || 5001, name, group_name: "Romance Dawn", released: "2025-09-16", current, points };
}

/** Registers the routes; returns the card page requests the page made (`id?days`). */
export async function mockCardApi(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route("**/api/meta/cards/*", (route) => {
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const days = Number(url.searchParams.get("days") ?? 30);
    asked.push(`${id}?days=${days}`);
    if (id === ZORO) return route.fulfill({ json: characterPage(days) });
    if (id === LEADER) return route.fulfill({ json: leaderPage(days) });
    return route.fulfill({ status: 404, json: { detail: "Unknown card" } });
  });
  await page.route("**/api/catalog/cards/*/price-history*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: history(Number(url.searchParams.get("product_id") ?? 0)) });
  });
  return asked;
}
