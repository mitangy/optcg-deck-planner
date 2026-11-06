/**
 * Decks sync with the planner at all times for signed-in players (#1017): the Decks page says so instead of
 * offering a planner column or "Add to planner", and a linked deck's alt art pick reaches the planner.
 * The API is faked: /auth/me signs in, /duel/decks is an empty account, PUT /owned/:id/display records the art.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const ALT_CARD = "OP09-118";

async function fakeAccount(page: Page, artPuts: { card: string; product_id: number }[]) {
  await page.route(`${FAKE_API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ json: { id: 7, email: "e2e@e2e.test", name: "E2E", username: "e2e" } });
    if (path === "/duel/decks") return route.fulfill({ json: { decks: [] } });
    if (path.startsWith("/duel/decks/")) return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
    const art = path.match(/^\/owned\/([^/]+)\/display$/);
    if (art && req.method() === "PUT") {
      artPuts.push({ card: decodeURIComponent(art[1]), ...(JSON.parse(req.postData() ?? "{}") as { product_id: number }) });
      return route.fulfill({ json: { card_id: art[1], product_id: 1 } });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
}

async function seed(page: Page, linked: boolean) {
  const cards = [...RED_VANILLA.cards.slice(0, 16), ALT_CARD, ALT_CARD, ALT_CARD, ALT_CARD];
  await page.addInitScript(
    ([deck, plannerDeckId]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem(
        "optcg.duel.savedDecks.v1",
        JSON.stringify([{ id: "e2e-sync", name: "Red Alt", ...deck, ...(plannerDeckId ? { plannerDeckId } : {}), updatedAt: 1 }]),
      );
    },
    [{ leaderId: RED_VANILLA.leaderId, cards }, linked ? 41 : 0] as const,
  );
}

test("the Decks page says decks sync with the planner and offers no planner column or Add to planner (#1017)", async ({ page }) => {
  await fakeAccount(page, []);
  await seed(page, false);
  await page.goto("/decks");
  const note = page.getByText("Signed in: your decks stay in sync with the deck planner.");
  await expect(note).toBeVisible();
  await expect(page.getByRole("heading", { name: "From your planner" })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions for Red Alt" }).click();
  await expect(page.getByRole("menuitem", { name: "Play with this deck" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Add to planner" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Nothing sideways, and the deck cards use the full width the planner column used to share.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const card = await page.locator(".deck-card").first().boundingBox();
  const noteBox = await note.boundingBox();
  expect(card!.y).toBeGreaterThan(noteBox!.y);
});

test("an alt art picked in a linked deck's editor is set as the planner's art too (#1017)", async ({ page }, info) => {
  // Phones hide the card's Artwork row; the pick is made in the card preview there.
  test.skip(info.project.name === "phone-375", "the Artwork row is desktop-only");
  const artPuts: { card: string; product_id: number }[] = [];
  await fakeAccount(page, artPuts);
  await seed(page, true);
  await page.goto("/decks/e2e-sync/configure");
  await expect(page.getByText("Synced with planner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to planner" })).toHaveCount(0);
  expect(artPuts).toEqual([]);

  const stack = page.locator("article.deck-stack", { hasText: ALT_CARD });
  await stack.locator(".deck-stack-art-select").click();
  await page.getByRole("option").nth(1).click();
  await expect.poll(() => artPuts.length).toBe(1);
  expect(artPuts[0].card).toBe(ALT_CARD);
  expect(artPuts[0].product_id).toBeGreaterThan(0);
});
