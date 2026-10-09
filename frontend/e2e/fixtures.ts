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
/** DON!! catalog rows for the "Available DON!! cards" drawer. Kept out of CARDS so deck and shopping fixtures (and snapshots) stay unchanged. */
const DON_CARDS = [
  { card_id: "DON-001", name: "DON!! Card (Luffy)", product_id: 301, group_name: "Extra Booster: Memorial Collection" },
  { card_id: "DON-002", name: "DON!! Card (Zoro)", product_id: 302, group_name: "Premium Booster" },
  { card_id: "DON-003", name: "DON!! Card (Nami Gold)", product_id: 303, group_name: "Premium Booster" },
].map((c) => ({ ...c, rarity: "DON", color: "", card_type: "DON!!", cost: null, market_price: 1.5, low_price: 1.1 }));
const SALES = fixture<unknown[]>("sales.json");
const SHARE = fixture<unknown>("share.json");
type MetaDeckFixture = { placing: number | null; [key: string]: unknown };
const META_LEADERS = fixture<{ leaders: unknown[] }>("meta-leaders.json");
const META_DECKS = fixture<{ leader_id: string; decks: MetaDeckFixture[] }>("meta-decks.json");

export const SHARE_TOKEN = "tok-oden-1";
export const DECK_ID = 1;
export const GROUP_BUY_ID = 7;
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
  /** Wanted alt-art copies as the fake backend holds them, keyed `CARD-ID:productId`. */
  altWants: Map<string, number>;
  /** Requests the page made to the fake API, e.g. "PUT /owned/EB01-002". */
  requests: string[];
  /** Page errors and console errors collected so far (network noise excluded). */
  errors: string[];
  /** Turn Log Pose on for this session (call before `open`): the fake chat session answers enabled. */
  enableLogPose(): void;
  /** Sign out for this session (call before `open`): /auth/me answers null. */
  signOut(): void;
  /** Decks the page created through POST /decks (name and decklist as sent). */
  createdDecks: { name: string; decklist: string }[];
  /** JSON bodies the page POSTed to the fake analyst's /chat. */
  chats: { message: string; thread_id?: number; context?: { page?: string; deck?: { leaderId: string | null; plannerDeckId?: number }; hint?: { id: string } } }[];
};

export const test = base.extend<{ planner: Planner }>({
  planner: async ({ page }, use) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`console: ${m.text()}`);
    });

    let signedIn = true;
    const createdDecks: Planner["createdDecks"] = [];
    const owned = new Map(CARDS.map((c) => [c.card_id, c.owned]));
    const altWants = new Map<string, number>();
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
        alt_arts: (c.alt_arts ?? []).map((a) => ({ image_url: img(a.product_id), tcgplayer_url: "", ...a, wanted: altWants.get(`${c.card_id}:${a.product_id}`) ?? 0 })),
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
    // Mirrors backend allocate_still_need_buys: wanted alt copies first (capped by still_need), the rest at the standard price.
    const remainingCost = (v: ReturnType<typeof cardView>) => {
      let left = v.still_need;
      let total = 0;
      for (const a of v.alt_arts) {
        const take = Math.min(a.wanted, left);
        total += take * a.market_price;
        left -= take;
      }
      return Math.round((total + left * v.market_price) * 100) / 100;
    };
    const shopping = () => {
      const items = CARDS.filter((c) => c.card_type !== "Leader").map((c) => {
        const v = cardView(c);
        return {
          ...v,
          need: v.needed,
          remaining_cost: remainingCost(v),
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

    let groupBuyPurchased = false;
    const groupBuy = () => {
      const kid = cardView(CARDS.find((c) => c.card_id === "EB01-003")!);
      const qty = groupBuyPurchased ? 0 : 4;
      const remaining = Math.round(qty * kid.market_price * 100) / 100;
      return {
        id: GROUP_BUY_ID,
        title: "Kid & Killer split",
        status: groupBuyPurchased ? "completed" : "ordered",
        invite_token: "gb-invite",
        invite_path: "/group-buy/join/gb-invite",
        host_user_id: 1,
        host_name: "Nami",
        member_count: 1,
        is_host: true,
        is_public: false,
        public_path: null,
        unique_cards: 1,
        cards_still_needed: qty,
        remaining_market: remaining,
        created_at: "2026-01-10T12:00:00Z",
        members: [
          { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: qty, remaining_market: remaining, card_cost: 27.2, shipping_share: 0, tax_share: 0, total_owed: 27.2 },
        ],
        lines: [
          {
            card_id: kid.card_id,
            name: kid.name,
            color: kid.color,
            rarity: kid.rarity,
            card_type: kid.card_type,
            cost: String(kid.cost),
            total_qty: qty,
            market_price: kid.market_price,
            remaining_cost: remaining,
            product_id: kid.product_id,
            tcgplayer_url: kid.tcgplayer_url,
            image_url: kid.image_url,
            members: [{ user_id: 1, display_name: "Nami", qty }],
            alt_arts: [],
            my_qty: qty,
            my_suggested_qty: qty,
            my_is_custom: false,
          },
        ],
        locked_at: "2026-01-11T12:00:00Z",
        ordered_at: "2026-01-12T12:00:00Z",
        external_order_id: "",
        order_notes: "",
        shipping_cost: 0,
        shipping_split: "equal",
        tax_cost: 0,
        cards_subtotal: 27.2,
        grand_total: 27.2,
        receipt_text: "4\tOne Piece Card Game - Memorial Collection - Kid & Killer - Near Mint",
        has_receipt: true,
        can_undo_purchase: groupBuyPurchased,
      };
    };

    // Nothing leaves the machine: the art CDN gets a placeholder, everything else off-box is refused.
    await page.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
    // Log Pose is off by default (the session endpoint answers 404 below); enableLogPose() turns it on.
    let logPoseOn = false;
    const chats: Planner["chats"] = [];
    await page.route("**/fake-analyst/chat", (route) => {
      chats.push(JSON.parse(route.request().postData() ?? "{}") as Planner["chats"][number]);
      const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse("thread", { thread_id: 5 }) + sse("text", { delta: "Because the deck has 15 cards." }) + sse("done", { thread_id: 5 }),
      });
    });
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
      if (path === "/analyst/chat/session" && logPoseOn) {
        return json({ enabled: true, token: "t", expires_at: "2030-01-01T00:00:00Z", chat_url: "http://127.0.0.1:5180/fake-analyst" });
      }
      if (path === "/auth/me" && !signedIn) return json(null);
      if (path === "/meta/leaders") return json({ ...META_LEADERS, days: Number(new URL(req.url()).searchParams.get("days") ?? 30) });
      if (path === "/meta/decks") {
        const q = new URL(req.url()).searchParams;
        const top = Number(q.get("top") ?? 0);
        const same = q.get("leader") === META_DECKS.leader_id;
        return json({ ...META_DECKS, decks: same ? META_DECKS.decks.filter((d) => !top || (d.placing !== null && d.placing <= top)) : [] });
      }
      if (path === "/decks" && method === "POST") {
        const body = JSON.parse(req.postData() ?? "{}") as { name: string; decklist: string };
        createdDecks.push(body);
        return json({ id: DECK_ID, name: body.name, leader_card_id: "OP17-039", card_count: 0, total_cards: 0, sort_order: 1 });
      }
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
      if (path === "/catalog/cards") {
        // Name / ID search over the fixture cards (the deck editor and Collection "Add cards" use it).
        const params = new URL(req.url()).searchParams;
        const q = (params.get("q") ?? "").toLowerCase();
        if ((params.get("card_type") ?? "").toLowerCase().includes("don")) {
          return json(
            DON_CARDS.filter((c) => `${c.card_id} ${c.name} ${c.group_name}`.toLowerCase().includes(q)).map((c) => ({
              ...c,
              image_url: img(c.product_id),
              tcgplayer_url: "",
            })),
          );
        }
        if (!q) return json([]);
        return json(
          CARDS.filter((c) => `${c.card_id} ${c.name}`.toLowerCase().includes(q)).map((c) => ({
            card_id: c.card_id,
            name: c.name,
            rarity: c.rarity,
            color: c.color,
            card_type: c.card_type,
            cost: c.cost,
            market_price: c.market_price,
            low_price: c.low_price,
            image_url: img(c.product_id),
            tcgplayer_url: "",
            group_name: "Extra Booster: Memorial Collection",
          })),
        );
      }
      if ((m = path.match(/^\/owned\/(.+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!);
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        owned.set(cardId, qty);
        return json({ card_id: cardId, qty });
      }
      // Alt-art wants: the deck page saves one printing's count and gets the deck back.
      if ((m = path.match(/^\/decks\/(\d+)\/cards\/([^/]+)\/printings\/(\d+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[2]!).toUpperCase();
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        altWants.set(`${cardId}:${m[3]}`, qty);
        return json(deckDetail());
      }
      // One ordered group buy for 4 × Kid & Killer. Mark purchased adds the receipt copies to Owned; Undo takes them back.
      if (path === "/group-buys") return json([groupBuy()]);
      if (path === `/group-buys/${GROUP_BUY_ID}`) return json(groupBuy());
      if (path === `/group-buys/${GROUP_BUY_ID}/receipt/match` && method === "POST") {
        return json({
          lines: [{ card_id: "EB01-003", name: "Kid & Killer", group_name: "Extra Booster: Memorial Collection", needed_qty: 4, receipt_qty: 4, status: "exact", confidence: "high", product_id: 102, staged_qty: 4, descriptions: [] }],
          unmatched: [],
          summary: { exact: 1, receipt_copies: 4, needed_copies: 4 },
          can_apply_full: true,
          can_apply_partial: true,
        });
      }
      if (path === `/group-buys/${GROUP_BUY_ID}/receipt/apply` && method === "POST") {
        owned.set("EB01-003", (owned.get("EB01-003") ?? 0) + 4);
        groupBuyPurchased = true;
        return json(groupBuy());
      }
      if (path === `/group-buys/${GROUP_BUY_ID}/receipt/undo` && method === "POST") {
        owned.set("EB01-003", Math.max(0, (owned.get("EB01-003") ?? 0) - 4));
        groupBuyPurchased = false;
        return json(groupBuy());
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
      altWants,
      requests,
      errors,
      chats,
      createdDecks,
      signOut() {
        signedIn = false;
      },
      enableLogPose() {
        logPoseOn = true;
      },
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
