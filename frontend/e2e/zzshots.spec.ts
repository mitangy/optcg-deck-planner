import { test, DECK_ID } from "./fixtures";
import catalog from "../../duel-web/src/assets/cardCatalog.json" with { type: "json" };
const C = ((catalog as any).cards ?? catalog) as Record<string, { productId?: number }>;
const P = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { productId: v.productId }]));
const out = process.env.SHOT_DIR!;
test("shots", async ({ page, planner }, info) => {
  const sizes = info.project.name === "desktop-1200" ? [[1200, 900], [1440, 900]] : [[375, 812], [812, 375]];
  const map = new Map<number, string>();
  page.on("response", async (r) => {
    if (!r.url().includes("/api/decks/")) return;
    try {
      const j = await r.json();
      for (const c of j.cards ?? []) {
        if (c.product_id) map.set(c.product_id, c.card_id);
        for (const a of c.alt_arts ?? []) map.set(a.product_id, c.card_id);
      }
      if (j.leader_card_id) map.set(100, j.leader_card_id);
    } catch {}
  });
  await planner.open(`/decks/${DECK_ID}`);
  await page.route("https://tcgplayer-cdn.tcgplayer.com/**", async (route) => {
    const m = /product\/(\d+)_/.exec(route.request().url());
    const card = m ? map.get(Number(m[1])) : undefined;
    const real = card ? P[card]?.productId : undefined;
    if (!real) return route.fallback();
    const res = await route.fetch({ url: `https://tcgplayer-cdn.tcgplayer.com/product/${real}_400w.jpg` });
    return route.fulfill({ response: res });
  });
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    await page.waitForTimeout(2500);
    const sel = '[data-card-id="EB01-002"]:visible';
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${process.env.TAG}-planner-list-${w}x${h}.png` });
    await page.getByRole("button", { name: "Grid", exact: true }).first().click().catch(() => page.getByText("Grid", { exact: true }).first().click());
    await page.waitForTimeout(1200);
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${process.env.TAG}-planner-grid-${w}x${h}.png` });
    await page.getByRole("button", { name: "List", exact: true }).first().click().catch(() => {});
  }
});
