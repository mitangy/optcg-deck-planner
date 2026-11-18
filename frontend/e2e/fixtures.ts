import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { auditPage, formatIssues, issueKey, type AuditIssue } from "./audit";
import { isKnown } from "./known-issues";
import type {
  AlertDirection,
  CardView,
  CatalogCardResult,
  DeckDetail,
  DeckSummary,
  GroupBuyDetail,
  GroupBuyReceiptMatchReport,
  NotificationsResponse,
  OwnedCollectionResponse,
  PriceAlert,
  PriceAlertsResponse,
  PriceHistoryResponse,
  RecentSale,
  RecentSalesResponse,
  ShoppingResponse,
  User,
} from "../src/api";

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
const BASE_CARDS = fixture<FixtureCard[]>("cards.json");
const DON_CARDS = [
  { card_id: "DON-001", name: "DON!! Card (Luffy)", product_id: 301, group_name: "Extra Booster: Memorial Collection" },
  { card_id: "DON-002", name: "DON!! Card (Zoro)", product_id: 302, group_name: "Premium Booster" },
  { card_id: "DON-003", name: "DON!! Card (Nami Gold)", product_id: 303, group_name: "Premium Booster" },
].map((c) => ({ ...c, rarity: "DON", color: "", card_type: "DON!!", cost: null, market_price: 1.5, low_price: 1.1 }));
const SALES = fixture<RecentSale[]>("sales.json");
const SHARE = fixture<unknown>("share.json");
type MetaDeckFixture = { placing: number | null; [key: string]: unknown };
const META_LEADERS = fixture<{ leaders: unknown[] }>("meta-leaders.json");
const META_DECKS = fixture<{ leader_id: string; decks: MetaDeckFixture[] }>("meta-decks.json");

export const PRICE_HISTORY_DAYS = 120;
export function chaseCardHistory(days = PRICE_HISTORY_DAYS): [string, number][] {
  const last = Date.UTC(2026, 0, 14);
  const points: [string, number][] = [];
  for (let d = 0; d < days; d++) {
    let price: number;
    if (d <= 7) price = 60 + (120 * d) / 7;
    else if (d <= 67) price = 180 - (90 * (d - 7)) / 60;
    else price = 90 + 4 * Math.sin(d / 6);
    if (d === 80) price = 84;
    if (d === days - 1) price = 92;
    const day = new Date(last - (days - 1 - d) * 86_400_000).toISOString().slice(0, 10);
    points.push([day, Math.round(price * 100) / 100]);
  }
  return points;
}

export const SHARE_TOKEN = "tok-oden-1";

type ShareItem = { need: number; owned: number; alts_owned?: number; still_need: number; market_price: number | null; remaining_cost: number | null };
function signedOutShare(): unknown {
  const share = SHARE as { items: ShareItem[] };
  const items = share.items.map((i) => ({
    ...i,
    owned: 0,
    alts_owned: 0,
    still_need: i.need,
    remaining_cost: i.market_price == null ? null : Math.round(i.need * i.market_price * 100) / 100,
  }));
  return {
    ...share,
    items,
    viewer_signed_in: false,
    cards_still_needed: items.reduce((n, i) => n + i.still_need, 0),
    remaining_market: Math.round(items.reduce((n, i) => n + (i.remaining_cost ?? 0), 0) * 100) / 100,
  };
}
export const DECK_ID = 1;
export const GROUP_BUY_ID = 7;
export const FIXED_NOW = new Date("2026-01-15T12:00:00Z");

const img = (productId: number | null) => (productId ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg` : "");

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect width="200" height="280" fill="#8a8f98"/><rect x="12" y="12" width="176" height="256" fill="none" stroke="#fff" stroke-width="4"/></svg>';

type Planner = {
  open(path: string): Promise<void>;
  audit(opts?: Parameters<typeof auditPage>[1]): Promise<AuditIssue[]>;
  owned: Map<string, number>;
  altOwned: Map<string, number>;
  ownedAdds: { items: { card_id: string; add: number }[] }[];
  collectors: Map<string, number>;
  addAlt(cardId: string, alt: { product_id: number; name: string; market_price: number }): void;
  altWants: Map<string, number>;
  displayArt: Map<string, number>;
  extras: Map<string, number>;
  manyAlts(cardId: string, count: number): void;
  /** Adds `count` plain Character cards (no alt arts) so lists are long enough to scroll. */
  manyCards(count: number): void;
  /** Keep each page's own default List density (Compact on Shopping and Collection) instead of the Comfortable rows older specs expect. */
  defaultDensity: boolean;
  noDecks(): void;
  priceAlertPosts: { card_id: string; product_id: number; target_price: number; direction: AlertDirection }[];
  requests: string[];
  errors: string[];
  enableLogPose(): void;
  signOut(): void;
  addSecondDeck(): void;
  printingPuts: { path: string; body: { qty: number; deck_ids?: number[] } }[];
  collectorPuts: { path: string; qty: number }[];
  readonly deckHidden: boolean;
  createdDecks: { name: string; decklist: string }[];
  replacedLists: string[];
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
    const replacedLists: string[] = [];
    const CARDS: FixtureCard[] = [...BASE_CARDS];
    let deckCards: FixtureCard[] = CARDS;
    const owned = new Map(CARDS.map((c) => [c.card_id, c.owned]));
    const altOwned = new Map<string, number>();
    const altWants = new Map<string, number>();
    const collectors = new Map<string, number>();
    const addedAlts = new Map<string, { product_id: number; name: string; market_price: number }[]>();
    const extras = new Map<string, number>();
    const ownedAdds: Planner["ownedAdds"] = [];
    const priceAlertPosts: Planner["priceAlertPosts"] = [];
    const alertsByArt = new Map<string, Planner["priceAlertPosts"][number]>();
    const displayArt = new Map<string, number>();
    let hasDecks = true;
    let secondDeck = false;
    const printingPuts: Planner["printingPuts"] = [];
    const collectorPuts: Planner["collectorPuts"] = [];
    let deckHidden = false;
    const extraAlts = new Map<string, number>();
    const cardView = (c: FixtureCard) => {
      const o = owned.get(c.card_id) ?? 0;
      const synthetic = Array.from({ length: extraAlts.get(c.card_id) ?? 0 }, (_, i) => ({
        product_id: 9000 + i,
        name: `${c.name} (Alt ${i + 1})`,
        market_price: 3 + i,
        low_price: 2 + i,
        group_name: "Extra Booster: Memorial Collection",
        is_special: false,
      }));
      const added = (addedAlts.get(c.card_id) ?? []).map((a) => ({ low_price: a.market_price, group_name: "Extra Booster: Memorial Collection", is_special: true, ...a }));
      const alt_arts = [...(c.alt_arts ?? []), ...added, ...synthetic].map((a) => ({ image_url: img(a.product_id), tcgplayer_url: "", ...a, owned: altOwned.get(`${c.card_id}:${a.product_id}`) ?? 0, wanted: altWants.get(`${c.card_id}:${a.product_id}`) ?? 0, collector: collectors.get(`${c.card_id}:${a.product_id}`) ?? 0 }));
      const deckAlts = alt_arts.reduce((n, a) => n + a.owned - Math.min(a.owned, a.collector), 0);
      return {
        card_id: c.card_id,
        name: c.name,
        rarity: c.rarity,
        color: c.color,
        card_type: c.card_type,
        cost: c.cost,
        needed: c.needed,
        owned: o,
        alts_owned: deckAlts,
        still_need: Math.max(0, c.needed - o - deckAlts),
        collector_want: alt_arts.reduce((n, a) => n + a.collector, 0),
        market_price: c.market_price,
        low_price: c.low_price,
        image_url: img(c.product_id),
        tcgplayer_url: c.product_id ? `https://www.tcgplayer.com/product/${c.product_id}` : "",
        product_id: c.product_id,
        section: c.section,
        alt_arts,
        display_art: displayArt.get(c.card_id) ?? null,
      } satisfies CardView;
    };
    const mainCards = CARDS.reduce((s, c) => s + c.needed, 0);
    const deckDetail = () => ({
      id: DECK_ID,
      name: "Oden Red/Green",
      leader_card_id: "EB01-001",
      leader_name: "Kouzuki Oden",
      prior_decks: [],
      is_main: true,
      cards: deckCards.map(cardView),
      main_cards: deckCards === CARDS ? mainCards : deckCards.reduce((s, c) => s + c.needed, 0),
      don_cards: 0,
      hidden_from_friends: deckHidden,
    }) satisfies DeckDetail;
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
    const deckAltsOf = (v: ReturnType<typeof cardView>) => v.alt_arts.reduce((n, a) => n + a.owned - Math.min(a.owned, a.collector), 0);
    const collectorLines = (v: ReturnType<typeof cardView>) =>
      v.alt_arts
        .filter((a) => a.collector > 0)
        .map((a) => {
          const have = Math.min(a.owned, a.collector);
          const still = a.collector - have;
          return { product_id: a.product_id, label: a.name, image_url: a.image_url, market_price: a.market_price, want: a.collector, have, still_need: still, remaining_cost: Math.round(still * a.market_price * 100) / 100 };
        });
    const shopping = (withExtras = true, withCollector = true, noDecks = false) => {
      const deckCards = hasDecks && !noDecks ? CARDS.filter((c) => c.card_type !== "Leader") : [];
      const fromDecks = deckCards.map((c) => {
        const v = cardView(c);
        const extra = withExtras ? (extras.get(c.card_id) ?? 0) : 0;
        const need = Math.max(v.needed, extra);
        const item = { ...v, need, still_need: Math.max(0, need - v.owned - deckAltsOf(v)) };
        return {
          ...item,
          remaining_cost: remainingCost(item),
          used_in: ["Oden Red/Green"],
          primary_leader_card_id: "EB01-001",
          primary_leader_name: "Kouzuki Oden",
          leader_count: 1,
          extra_qty: extra,
          deck_need: v.needed,
        };
      });
      const onlyExtras = withExtras
        ? CARDS.filter((c) => !deckCards.includes(c) && (extras.get(c.card_id) ?? 0) > 0).map((c) => {
            const v = cardView(c);
            const need = extras.get(c.card_id)!;
            const item = { ...v, need, still_need: Math.max(0, need - v.owned - deckAltsOf(v)) };
            return {
              ...item,
              remaining_cost: remainingCost(item),
              used_in: [] as string[],
              primary_leader_card_id: null,
              primary_leader_name: null,
              leader_count: 1,
              deck_sort_key: "9999-9999-9999",
              extra_qty: need,
              deck_need: 0,
            };
          })
        : [];
      const onlyCollector = CARDS.filter((c) => withCollector && !deckCards.includes(c) && !onlyExtras.some((i) => i.card_id === c.card_id) && collectorLines(cardView(c)).length > 0).map((c) => {
        const v = cardView(c);
        return { ...v, need: 0, still_need: 0, remaining_cost: 0, used_in: [] as string[], primary_leader_card_id: null, primary_leader_name: null, leader_count: 1, deck_sort_key: "9999-9999-9999", extra_qty: 0, deck_need: 0 };
      });
      const items = [...fromDecks, ...onlyExtras, ...onlyCollector].map((i) => ({ ...i, collector_wants: withCollector ? collectorLines(i as ReturnType<typeof cardView>) : [] }));
      const lines = items.flatMap((i) => i.collector_wants);
      return {
        items,
        cards_still_needed: items.reduce((s, i) => s + i.still_need, 0) + lines.reduce((s, l) => s + l.still_need, 0),
        remaining_market: items.reduce((s, i) => s + (i.remaining_cost ?? 0), 0) + lines.reduce((s, l) => s + l.remaining_cost, 0),
        unique_cards: items.length,
        collector_copies: lines.reduce((s, l) => s + l.want, 0),
      } satisfies ShoppingResponse;
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
            alt_arts: kid.alt_arts,
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
      } satisfies GroupBuyDetail;
    };

    await page.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
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
        return json({ id: DECK_ID, name: body.name, leader_card_id: "OP17-039", card_count: 0, total_cards: 0, sort_order: 1 } satisfies DeckSummary);
      }
      if (path === "/auth/me") return json({ id: 1, email: "nami@e2e.test", name: "Nami", sum_across_leaders: false } satisfies User);
      if (path === "/decks") {
        const d = deckDetail();
        if (!hasDecks) return json([]);
        const decks: DeckSummary[] = [
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
            remaining_cost: 36.8,
            sort_order: 0,
            is_main: true,
          },
        ];
        if (secondDeck) decks.push({ ...decks[0]!, id: DECK_ID + 1, name: `${d.name} 2`, sort_order: 1, is_main: false });
        return json(decks);
      }
      if (path === `/decks/${DECK_ID}/decklist` && method === "PUT") {
        const list = (JSON.parse(req.postData() ?? "{}") as { decklist: string }).decklist;
        replacedLists.push(list);
        const counts = new Map<string, number>();
        for (const line of list.split("\n")) {
          const hit = line.trim().match(/^(\d+)x(.+)$/i);
          if (hit) counts.set(hit[2]!.toUpperCase(), Number(hit[1]));
        }
        deckCards = CARDS.filter((c) => counts.has(c.card_id)).map((c) => ({ ...c, needed: counts.get(c.card_id)! }));
        return json(deckDetail());
      }
      if (path === `/decks/${DECK_ID}`) {
        if (method === "PATCH") {
          const patch = JSON.parse(req.postData() ?? "{}") as { hidden_from_friends?: boolean };
          if (typeof patch.hidden_from_friends === "boolean") deckHidden = patch.hidden_from_friends;
        }
        return json(deckDetail());
      }
      if (path === "/shopping") {
        const q = new URL(req.url()).searchParams;
        return json(shopping(q.get("extras") !== "false", q.get("collector") !== "false", q.get("no_decks") === "true"));
      }
      if ((m = path.match(/^\/shopping\/extras\/(.+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!);
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        if (qty > 0) extras.set(cardId, qty);
        else extras.delete(cardId);
        return json({ card_id: cardId, qty });
      }
      if (path === "/share/shopping") return json(null);
      if (path === "/owned" && method === "GET") {
        const trueAlts = (v: ReturnType<typeof cardView>) => v.alt_arts.reduce((n, a) => n + a.owned, 0);
        const holds = (c: FixtureCard) => cardView(c).owned + trueAlts(cardView(c)) > 0;
        const items = CARDS.filter(holds).map((c) => {
          const v = cardView(c);
          const buying = shopping().items.find((i) => i.card_id === c.card_id)?.still_need ?? 0;
          const altValue = v.alt_arts.reduce((n, a) => n + a.owned * a.market_price, 0);
          return { ...v, value: Math.round((v.owned * v.market_price + altValue) * 100) / 100, used_in: ["Oden Red/Green"], buying };
        });
        return json({
          items,
          unique_cards: items.length,
          total_copies: items.reduce((s, i) => s + i.owned + trueAlts(i), 0),
          total_value: Math.round(items.reduce((s, i) => s + i.value, 0) * 100) / 100,
          unpriced_cards: 0,
        } satisfies OwnedCollectionResponse);
      }
      if (path === "/catalog/cards") {
        const params = new URL(req.url()).searchParams;
        const q = (params.get("q") ?? "").toLowerCase();
        if ((params.get("card_type") ?? "").toLowerCase().includes("don")) {
          return json(
            DON_CARDS.filter((c) => `${c.card_id} ${c.name} ${c.group_name}`.toLowerCase().includes(q)).map((c) => ({
              ...c,
              image_url: img(c.product_id),
              tcgplayer_url: "",
            } satisfies CatalogCardResult)),
          );
        }
        const onlyLeaders = (params.get("card_type") ?? "") === "Leader";
        if (!q && !onlyLeaders) return json([]);
        return json(
          CARDS.filter((c) => `${c.card_id} ${c.name}`.toLowerCase().includes(q) && (!onlyLeaders || c.card_type === "Leader")).map((c) => ({
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
          } satisfies CatalogCardResult)),
        );
      }
      if ((m = path.match(/^\/cards\/([^/]+)\/collector\/(\d+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!).toUpperCase();
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        collectorPuts.push({ path, qty });
        if (qty > 0) collectors.set(`${cardId}:${m[2]}`, qty);
        else collectors.delete(`${cardId}:${m[2]}`);
        return json({ card_id: cardId, product_id: Number(m[2]), qty });
      }
      // Alt-art copies owned: PUT /owned/:card/printings/:product (must match before /owned/:card).
      if ((m = path.match(/^\/owned\/([^/]+)\/printings\/(\d+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!).toUpperCase();
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        if (qty > 0) altOwned.set(`${cardId}:${m[2]}`, qty);
        else altOwned.delete(`${cardId}:${m[2]}`);
        return json({ card_id: cardId, product_id: Number(m[2]), qty });
      }
      if ((m = path.match(/^\/(?:decks\/\d+\/)?cards\/([^/]+)\/printings\/(\d+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!).toUpperCase();
        const card = CARDS.find((c) => c.card_id === cardId);
        const body = JSON.parse(req.postData() ?? "{}") as { qty: number; deck_ids?: number[] };
        if (!path.startsWith("/decks/")) printingPuts.push({ path, body });
        const asked = body.qty;
        const qty = Math.max(0, Math.min(asked, card?.needed ?? 0));
        if (qty > 0) altWants.set(`${cardId}:${m[2]}`, qty);
        else altWants.delete(`${cardId}:${m[2]}`);
        return path.startsWith("/decks/") ? json(deckDetail()) : json({ card_id: cardId, product_id: Number(m[2]), qty, decks_updated: 1 });
      }
      if (path === "/owned/add" && method === "POST") {
        const body = JSON.parse(req.postData() ?? "{}") as Planner["ownedAdds"][number];
        ownedAdds.push(body);
        const items = body.items.map((i) => {
          const next = (owned.get(i.card_id) ?? 0) + i.add;
          owned.set(i.card_id, next);
          return { card_id: i.card_id, owned: next };
        });
        return json({ items });
      }
      if (path === "/price-alerts" && method === "POST") {
        const body = JSON.parse(req.postData() ?? "{}") as Planner["priceAlertPosts"][number];
        priceAlertPosts.push(body);
        alertsByArt.set(`${body.card_id}:${body.product_id}`, body);
        return json({
          id: [...alertsByArt.keys()].indexOf(`${body.card_id}:${body.product_id}`) + 1, card_name: "", art_name: "", image_url: "", tcgplayer_url: "", is_alt: body.product_id !== 0,
          current_price: null, notify_email: false, notify_app: true, paused: false, armed: true, met_now: false,
          triggered_at: null, created_at: "2026-11-01T00:00:00Z", ...body,
        } satisfies PriceAlert);
      }
      if (path === "/price-alerts") {
        return json({
          email_enabled: false,
          alerts: [...alertsByArt.values()].map((b, i) => ({
            id: i + 1, card_name: "", art_name: "", image_url: "", tcgplayer_url: "", is_alt: b.product_id !== 0, current_price: null,
            notify_email: false, notify_app: true, paused: false, armed: true, met_now: false, triggered_at: null, created_at: "2026-11-01T00:00:00Z", ...b,
          })),
        } satisfies PriceAlertsResponse);
      }
      if (path === "/notifications") return json({ items: [], unread: 0 } satisfies NotificationsResponse);
      if (path.startsWith("/catalog/cards/") && path.endsWith("/printings")) return json([]);
      if ((m = path.match(/^\/owned\/([^/]+)\/display$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!).toUpperCase();
        const productId = (JSON.parse(req.postData() ?? "{}") as { product_id: number | null }).product_id;
        if (productId == null) displayArt.delete(cardId);
        else displayArt.set(cardId, productId);
        return json({ card_id: cardId, product_id: productId });
      }
      if ((m = path.match(/^\/owned\/(.+)$/)) && method === "PUT") {
        const cardId = decodeURIComponent(m[1]!);
        const qty = (JSON.parse(req.postData() ?? "{}") as { qty: number }).qty;
        owned.set(cardId, qty);
        return json({ card_id: cardId, qty });
      }
      if (path === "/group-buys") return json([groupBuy()]);
      if (path === `/group-buys/${GROUP_BUY_ID}`) return json(groupBuy());
      if (path === `/group-buys/${GROUP_BUY_ID}/receipt/match` && method === "POST") {
        return json({
          lines: [{ card_id: "EB01-003", name: "Kid & Killer", group_name: "Extra Booster: Memorial Collection", needed_qty: 4, receipt_qty: 4, status: "exact", confidence: "high", product_id: 102, staged_qty: 4, descriptions: [] }],
          unmatched: [],
          summary: { exact: 1, receipt_copies: 4, needed_copies: 4 },
          can_apply_full: true,
          can_apply_partial: true,
        } satisfies GroupBuyReceiptMatchReport);
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
      const history = /^\/catalog\/cards\/([^/]+)\/price-history$/.exec(path);
      if (history) {
        const productId = Number(new URL(req.url()).searchParams.get("product_id") ?? 0);
        const card = CARDS.find((c) => c.card_id === decodeURIComponent(history[1]));
        if (!card) return json({ detail: "Unknown card or art" }, 404);
        const alt = card.alt_arts?.find((a) => a.product_id === productId);
        return json({
          card_id: card.card_id,
          product_id: alt ? alt.product_id : (card.product_id ?? 0),
          name: alt ? alt.name : card.name,
          group_name: alt ? alt.group_name : "Extra Booster: Memorial Collection",
          released: "2025-09-16",
          current: alt ? alt.market_price : 92,
          points: alt ? [] : chaseCardHistory(),
        } satisfies PriceHistoryResponse);
      }
      if (path.startsWith("/catalog/sales/")) return json({ product_id: Number(path.split("/").pop()), sales: SALES } satisfies RecentSalesResponse);
      if (path === `/public/share/${SHARE_TOKEN}/copy` && method === "POST") return signedIn ? json(deckDetail()) : json({ detail: "Not signed in" }, 401);
      if (path === `/public/share/${SHARE_TOKEN}`) return json(signedIn ? { ...(SHARE as object), viewer_signed_in: true } : signedOutShare());
      if (path.startsWith("/public/share/")) return json({ detail: "This share link is no longer available" }, 404);
      return json({ detail: `not in e2e fake API: ${method} ${path}` }, 404);
    });

    await page.clock.install({ time: FIXED_NOW });
    await page.addInitScript(() => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
    });

    await use({
      owned,
      altOwned,
      altWants,
      collectors,
      collectorPuts,
      addAlt(cardId, alt) {
        addedAlts.set(cardId, [...(addedAlts.get(cardId) ?? []), alt]);
      },
      displayArt,
      extras,
      ownedAdds,
      manyAlts(cardId, count) {
        extraAlts.set(cardId, count);
      },
      manyCards(count) {
        for (let i = 0; i < count; i++) {
          const n = String(20 + i).padStart(3, "0");
          const card: FixtureCard = { card_id: `EB01-${n}`, name: `Filler Pirate ${i + 1}`, rarity: "C", color: i % 2 ? "Green" : "Red", card_type: "Character", cost: 2 + (i % 5), product_id: 300 + i, market_price: 0.5 + i / 10, low_price: 0.3, needed: 4, owned: i % 3, section: "main" };
          CARDS.push(card);
          owned.set(card.card_id, card.owned);
        }
      },
      noDecks() {
        hasDecks = false;
      },
      requests,
      priceAlertPosts,
      get deckHidden() {
        return deckHidden;
      },
      errors,
      chats,
      createdDecks,
      replacedLists,
      addSecondDeck() {
        secondDeck = true;
      },
      printingPuts,
      signOut() {
        signedIn = false;
      },
      enableLogPose() {
        logPoseOn = true;
      },
      async open(this: Planner, path) {
        // Older specs were written for the roomy rows with inline alt tiles; a spec about the new defaults opts in.
        if (!this.defaultDensity) {
          await page.addInitScript(() => {
            for (const k of ["shopping", "collection", "deck", "share", "group_buy"]) {
              if (localStorage.getItem(`optcg_list_density_${k}`) === null) localStorage.setItem(`optcg_list_density_${k}`, "comfortable");
            }
          });
        }
        await page.goto(path);
      },
      defaultDensity: false,
      async audit(opts) {
        return (await auditPage(page, opts)).filter((i) => !isKnown(i));
      },
    });
  },
});

export { expect, formatIssues, issueKey };
