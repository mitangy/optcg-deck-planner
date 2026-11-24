import { expect, test } from "./fixtures";

const GB = 61;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

type St = "on_the_way" | "partial" | "arrived";
const CARDS: [string, string, number][] = [
  ["OP01-120", "Shanks", 701],
  ["OP05-119", "Monkey.D.Luffy", 702],
  ["OP01-025", "Roronoa Zoro", 703],
  ["OP02-013", "Portgas.D.Ace", 704],
  ["OP03-040", "Nami", 705],
  ["OP04-090", "Eustass Kid", 706],
  ["OP06-118", "Kuzan", 707],
  ["OP07-051", "Kolo", 708],
];

/** 18 packages like a real group buy: 4 arrived, 1 with a card missing, 13 on the way. Shanks is in packages 3 (Zoro), 9 (Nami, with 8 cards) and 14 (arrived, Nami). */
function makeOrders(status: Map<number, St>) {
  return Array.from({ length: 18 }, (_, k) => {
    const id = k + 1;
    const st = status.get(id) ?? (id >= 14 && id <= 17 ? "arrived" : id === 1 ? "partial" : "on_the_way");
    const picks: number[] = id === 9 ? [0, 1, 2, 3, 4, 5, 6, 7] : id === 3 ? [0] : id === 14 ? [0, 1] : [1 + (id % 7)];
    const lines = picks.map((c, j) => ({
      id: id * 10 + j, card_id: CARDS[c][0], name: CARDS[c][1], product_id: null, qty_ordered: 1, qty_arrived: st === "arrived" ? 1 : 0, qty_extra: 0,
      allocations: [{ user_id: 1, display_name: id === 3 ? "Zoro" : "Nami", qty: 1, qty_arrived: st === "arrived" ? 1 : 0 }],
    }));
    const n = lines.length;
    const arrived = st === "arrived" ? n : st === "partial" ? n - 1 : 0;
    return {
      id, seller_name: id === 2 ? "" : `Seller ${String.fromCharCode(64 + id)} Singles And Collectibles`, status: st, qty_ordered: n, qty_allocated: n, qty_arrived: arrived, qty_extra: 0,
      arrived_at: st === "arrived" ? "2026-11-20T15:00:00Z" : null, created_at: "2026-11-10T12:00:00Z", version: 1,
      order_number: `0000${String(id).padStart(4, "0")}-4B1E20-9EE${String(id).padStart(2, "0")}`, tracking_url: id % 3 === 0 ? "https://track.example/1" : "", receipt_text: "", lines,
    };
  });
}

const gline = (c: [string, string, number], over: Record<string, unknown> = {}) => ({
  card_id: c[0], name: c[1], color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 3, market_price: 1.5, remaining_cost: 4.5,
  product_id: c[2], preferred_product_id: c[2], preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(c[2]), base_image_url: IMG(c[2]),
  members: [{ user_id: 1, display_name: "Nami", qty: 3 }], alt_arts: [], art_wants: [], my_qty: 3, my_suggested_qty: 3, my_is_custom: false, my_need: 3,
  in_order: 3, arrived: 0, not_ordered: 0, my_in_order: 3, my_arrived: 0, my_not_ordered: 0, ...over,
});

function detail(status: Map<number, St>) {
  return {
    id: GB, title: "Friday pool", status: "ordered", invite_token: "t1441", invite_path: "/group-buy/join/t1441", host_user_id: 1, host_name: "Nami",
    member_count: 2, is_host: true, is_public: false, public_path: null, unique_cards: 3, cards_still_needed: 9, remaining_market: 13, created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 4, remaining_market: 6, card_cost: 6, shipping_share: 0, tax_share: 0, total_owed: 6 },
      { user_id: 2, display_name: "Zoro", role: "member", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 2, remaining_market: 3, card_cost: 3, shipping_share: 0, tax_share: 0, total_owed: 3 },
    ],
    lines: [
      gline(CARDS[0], { in_order: 3, arrived: 1, not_ordered: 1, not_ordered_members: [{ user_id: 1, display_name: "Nami", qty: 1, product_id: null }] }),
      gline(CARDS[1], { in_order: 6, arrived: 3 }),
    ],
    locked_at: "2026-01-11T12:00:00Z", ordered_at: "2026-01-12T12:00:00Z", external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0,
    cards_subtotal: 13, grand_total: 13, receipt_text: "", has_receipt: false, can_undo_purchase: false, orders: makeOrders(status),
  };
}

test("Host finds the package with a card, filters it, and a package marked arrived stays in place (#1441)", async ({ page, planner }) => {
  const status = new Map<number, St>();
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(status) }));
  await page.route(`**/api/group-buys/${GB}/orders/*/arrival`, (r) => {
    status.set(Number(r.request().url().match(/orders\/(\d+)\/arrival/)?.[1]), "arrived");
    return r.fulfill({ json: detail(status) });
  });
  await planner.open(`/group-buys/${GB}`);

  const cards = page.getByTestId("gb-order");
  await expect(cards).toHaveCount(18);
  // Default: open work first. The package with a card missing leads, with one main button.
  await expect(cards.first()).toHaveAttribute("data-status", "partial");
  await expect(cards.first().getByRole("button", { name: "Check missing cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan cards" })).toHaveCount(0);
  await expect(page.getByTestId("gb-packages")).toContainText("4 of 10 copies arrived");

  // One row of buttons per card, and nothing wider than the page.
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-testid=gb-order] .gb-order-actions")].map((a) => new Set([...a.querySelectorAll(".btn")].map((b) => Math.round(b.getBoundingClientRect().top))).size),
  );
  expect(Math.max(...rows)).toBe(1);
  const heads = await page.evaluate(() => [...document.querySelectorAll("[data-testid=gb-order] .gb-order-title")].every((h) => h.getBoundingClientRect().height < 30));
  expect(heads).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  const pills = page.getByRole("group", { name: "Package status" });
  await expect(pills.getByRole("button", { name: "All (18)" })).toBeVisible();
  await expect(pills.getByRole("button", { name: "On the way (13)" })).toBeVisible();
  await expect(pills.getByRole("button", { name: "Missing cards (1)" })).toBeVisible();
  await expect(pills.getByRole("button", { name: "Arrived (4)" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search packages" }).fill("shanks");
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole("status").filter({ hasText: "3 of 18 packages have “shanks”" })).toContainText("1 more copy is not in an order yet");
  await expect(pills.getByRole("button", { name: "All (3)" })).toBeVisible();
  await expect(pills.getByRole("button", { name: "On the way (2)" })).toBeVisible();
  await expect(pills.getByRole("button", { name: "Missing cards (1)" })).toHaveCount(0);
  await expect(page.locator(".gb-order-thumb.hit")).toHaveCount(3);
  await expect(page.getByTestId("gb-order-match").filter({ hasText: "OP01-120 ×1 · for Nami" })).toHaveCount(2);
  await expect(page.getByTestId("gb-order-match").filter({ hasText: "for Zoro" })).toHaveCount(1);
  // The matching card leads the row of the 8-card package, which shows a +N chip instead of cutting a thumbnail.
  const big = cards.filter({ hasText: "Seller I " });
  await expect(big.locator(".gb-order-thumb").first()).toHaveClass(/hit/);
  await expect(big.locator(".gb-order-more")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await pills.getByRole("button", { name: "On the way (2)" }).click();
  await expect(cards).toHaveCount(2);
  const first = cards.first(); // still the first card after the click, so it keeps its place
  const title = await first.getByRole("heading").innerText();
  await first.getByRole("button", { name: "Mark arrived" }).click();
  await expect(first).toHaveAttribute("data-status", "arrived");
  await expect(cards).toHaveCount(2);
  await expect(first.getByRole("heading")).toHaveText(title);
  await expect(page.getByRole("status").filter({ hasText: "stays here" })).toBeVisible();

  // Nothing matches: say so, and Clear search brings every package back (the pill resets too).
  await page.getByRole("searchbox", { name: "Search packages" }).fill("xyz");
  await expect(page.getByTestId("gb-pkg-empty")).toContainText("No package has “xyz”.");
  await page.getByTestId("gb-pkg-empty").getByRole("button", { name: "Clear search" }).click();
  await expect(cards).toHaveCount(18);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
