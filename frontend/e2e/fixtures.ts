/**
 * Playwright fixtures for the planner SPA. The FastAPI backend is faked in the
 * browser (`page.route`) from the small JSON files in e2e/fixtures/, so no
 * Python, Postgres or network access is needed. The fake is stateful for owned
 * counts so a stepper click round-trips like the real API: PUT /owned/:id
 * changes what GET /decks/:id and /shopping return next.
 */
import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { auditPage, formatIssues, issueKey, type AuditIssue } from "./audit";
import { isKnown } from "./known-issues";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;

type FixtureCard = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | null;
  product_id: number | null;
  market_price: number;
  low_price: number;
  needed: number;
  owned: number;
  section: string;
  alt_arts?: Array<{ product_id: number; name: string; market_price: number; low_price: number; group_name: string; is_special: boolean }>;
};
const CARDS = fixture<FixtureCard[]>("cards.json");
const SALES = fixture<unknown[]>("sales.json");
const SHARE = fixture<unknown>("share.json");

export const SHARE_TOKEN = "tok-oden-1";
export const DECK_ID = 1;
/** Fixed wall clock so dates in recent sales and anything time-derived never drift. */
export const FIXED_NOW = new Date("2026-01-15T12:00:00Z");

const img = (productId: number | null) => (productId ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg` : "");

/** A tiny card-shaped placeholder for the art CDN. */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect width="200" height="280" fill="#8a8f98"/><rect x="12" y="12" width="176" height="256" fill="none" stroke="#fff" stroke-width="4"/></svg>';

type Planner = {
  /** Open `path` (the fake session is always signed in). */
  open(path: string): Promise<void>;
  /** Audit the current screen; issues matching known-issues.ts are dropped. */
  audit(opts?: Parameters<typeof auditPage>[1]): Promise<AuditIssue[]>;
  /** Owned counts as the fake backend holds them. */
  owned: Map<string, number>;
  /** Requests the page made to the fake API, e.g. "PUT /owned/EB01-002". */
  requests: string[];
  /** Page errors and console errors collected so far (network noise excluded). */
  errors: string[];
};

export const test = base.extend<{ planner: Planner }>({
  planner: async ({ page }, use) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`console: ${m.text()}`);
    });

    const owned = new Map(CARDS.map((c) => [c.card_id, c.owned]));
    const cardView = (c: FixtureCard) => {
      const o = owned.get(c.card_id) ?? 0;
      return {
        card_id: c.card_id,
        name: c.name,
        rarity: c.rarity,
        color: c.color,
        card_type: c.card_type,
        cost: c.cost,
        needed: c.needed,
        owned: o,
        still_need: Math.max(0, c.needed - o),
        market_price: c.market_price,
        low_price: c.low_price,
        image_url: img(c.product_id),
        tcgplayer_url: c.product_id ? `https://www.tcgplayer.com/product/${c.product_id}` : "",
        product_id: c.product_id,
        section: c.section,
        alt_arts: (c.alt_arts ?? []).map((a) => ({ image_url: img(a.product_id), tcgplayer_url: "", wanted: 0, ...a })),
      };
    };
    const mainCards = CARDS.reduce((s, c) => s + c.needed, 0);
    const deckDetail = () => ({
      id: DECK_ID,
      name: "Oden Red/Green",
      leader_card_id: "EB01-001",
      leader_name: "Kouzuki Oden",
      prior_decks: [],
      is_main: true,
      cards: CARDS.map(cardView),
      main_cards: mainCards,
      don_cards: 0,
    });
    const shopping = () => {
      const items = CARDS.filter((c) => c.card_type !== "Leader").map((c) => {
        const v = cardView(c);
        return {
          ...v,
          need: v.needed,
          remaining_cost: v.still_need * v.market_price,
          used_in: ["Oden Red/Green"],
          primary_leader_card_id: "EB01-001",
          primary_leader_name: "Kouzuki Oden",
          leader_count: 1,
        };
      });
      return {
        items,
        cards_still_needed: items.reduce((s, i) => s + i.still_need, 0),
        remaining_market: items.reduce((s, i) => s + (i.remaining_cost ?? 0), 0),
        unique_cards: items.length,
      };
    };

    // Nothing leaves the machine: the art CDN gets a placeholder, everything else off-box is refused.
    await page.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
    await page.route("https://tcgplayer-cdn.tcgplayer.com/**", (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: PLACEHOLDER_SVG }),
    );
    await page.route("**/api/**", (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^\/api/, "");
      const method = req.method();
      requests.push(`${method} ${path}`);
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      let m: RegExpMatchArray | null;
      if (path === "/auth/me") return json({ id: 1, email: "nami@e2e.test", name: "Nami", sum_across_leaders: false });
      if (path === "/decks") {
        const d = deckDetail();
        return json([
          {
            id: DECK_ID,
            name: d.name,
            leader_card_id: d.leader_card_id,
            leader_name: d.leader_name,
            leader_image_url: img(100),
            card_count: CARDS.length,
            total_cards: mainCards,
            main_cards: mainCards,
            don_cards: 0,
            owned_copies: [...owned.values()].reduce((a, b) => a + b, 0),
            sort_order: 0,
            is_main: true,
          },
        ]);
      }
      if (path === `/decks/${DECK_ID}`) return json(deckDetail());
      if (path === "/shopping") return json(shopping());
      if (path === "/share/shopping") return json(null);
      if (path === "/owned" && method === "GET") {
        const items = CARDS.filter((c) => (owned.get(c.card_id) ?? 0) > 0).map((c) => {
          const v = cardView(c);
          return { ...v, value: Math.round(v.owned * v.market_price * 100) / 100, used_in: ["Oden Red/Green"] };
        });
        return json({
          items,
          unique_cards: items.length,
          total_copies: items.reduce((s, i) => s + i.owned, 0),
          total_value: Math.round(items.reduce((s, i) => s + i.value, 0) * 100) / 100,
          unpriced_cards: 0,
        });
      }
      if (path === "/catalog/cards") return json([]);
      if ((m = path.match(/^\/owned\/(.+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!);
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        owned.set(cardId, qty);
        return json({ card_id: cardId, qty });
      }
      if (path.startsWith("/catalog/sales/")) return json({ product_id: Number(path.split("/").pop()), sales: SALES });
      if (path === `/public/share/${SHARE_TOKEN}`) return json(SHARE);
      if (path.startsWith("/public/share/")) return json({ detail: "This share link is no longer available" }, 404);
      return json({ detail: `not in e2e fake API: ${method} ${path}` }, 404);
    });

    await page.clock.install({ time: FIXED_NOW });
    // Start every test from the same layout and filter preferences.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
    });

    await use({
      owned,
      requests,
      errors,
      async open(path) {
        await page.goto(path);
      },
      async audit(opts) {
        return (await auditPage(page, opts)).filter((i) => !isKnown(i));
      },
    });
  },
});

export { expect, formatIssues, issueKey };
