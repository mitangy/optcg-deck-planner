/**
 * Add a duel deck to the planner from the Decks page "…" menu, alt arts included (#1017).
 * The planner API is faked: POST /decks creates the deck, PUT /owned/:id/display sets the shown art.
 *
 * SHOTS=1 also saves screenshots to /tmp/pr-shots/1017/.
 */
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const SHOTS_DIR = "/tmp/pr-shots/1017";
const ALT_CARD = "OP09-118";
const ALT_PRODUCT = 597066;

test("Add to planner sends the deck and its alt arts to the planner (#1017)", async ({ page }, info) => {
  const created: { name: string; decklist: string }[] = [];
  const artPuts: { card: string; product_id: number }[] = [];
  await page.route(`${FAKE_API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ json: { id: 7, email: "e2e@e2e.test", name: "E2E", username: "e2e" } });
    if (path === "/decks" && req.method() === "GET") return route.fulfill({ json: [] });
    if (path === "/decks" && req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}") as { name: string; decklist: string };
      created.push(body);
      return route.fulfill({ json: { id: 41, name: body.name, leader_card_id: "ST01-001", card_count: 51 } });
    }
    const art = path.match(/^\/owned\/([^/]+)\/display$/);
    if (art && req.method() === "PUT") {
      artPuts.push({ card: decodeURIComponent(art[1]), ...(JSON.parse(req.postData() ?? "{}") as { product_id: number }) });
      return route.fulfill({ json: { card_id: art[1], product_id: ALT_PRODUCT } });
    }
    if (path === "/duel/decks") return route.fulfill({ json: { decks: [] } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  const cards = [...RED_VANILLA.cards.slice(0, 16), ALT_CARD, ALT_CARD, ALT_CARD, ALT_CARD];
  await page.addInitScript(
    ([deck, alt]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem(
        "optcg.duel.savedDecks.v1",
        JSON.stringify([{ id: "e2e-add", name: "Red Alt", ...deck, artPrefs: { [alt]: "p2" }, updatedAt: 1 }]),
      );
    },
    [{ leaderId: RED_VANILLA.leaderId, cards }, ALT_CARD] as const,
  );
  const shot = async (name: string) => {
    if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/${info.project.name}-${name}.png` });
  };

  await page.goto("/decks");
  if (info.project.name === "phone-375" && process.env.SHOTS) {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.getByRole("button", { name: "Actions for Red Alt" }).click();
    await page.waitForTimeout(800);
    await shot("0-landscape-menu");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
  }
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Actions for Red Alt" }).click();
  await page.waitForTimeout(400);
  const add = page.getByRole("menuitem", { name: "Add to planner" });
  await expect(add).toBeVisible();
  await shot("1-menu");
  await add.click();

  await expect(page.getByRole("status").filter({ hasText: "Added “Red Alt” to your planner · 1 alt art" })).toBeInViewport();
  expect(created).toHaveLength(1);
  expect(created[0].decklist).toContain(`4x${ALT_CARD}`);
  expect(artPuts).toEqual([{ card: ALT_CARD, product_id: ALT_PRODUCT }]);
  await shot("2-added");

  // Now linked: the menu no longer offers it.
  await page.getByRole("button", { name: "Actions for Red Alt" }).click();
  await expect(page.getByRole("menuitem", { name: "Play with this deck" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Add to planner" })).toHaveCount(0);
  await shot("3-linked-menu");

});
