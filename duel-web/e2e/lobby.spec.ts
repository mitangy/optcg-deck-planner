/**
 * The lobby as a guest: the FastAPI backend is faked in the browser, like
 * e2e/fixtures.ts. The lobby needs only /health and /auth/me (401 = signed out).
 */
import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

const test = base;

async function openLobby(page: Page): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  const decks = [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }];
  await page.addInitScript((d) => {
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, decks);
  await page.goto("/");
  await expect(page.locator(".home-deck")).toBeVisible();
}

test("shows the deck's leader name as plain text, not a pill (#431)", async ({ page }) => {
  await openLobby(page);
  const leader = page.locator(".home-deck-leader");
  await expect(leader).toBeVisible();
  await expect(leader).toHaveCSS("border-top-width", "0px");
});

test.describe("phone landscape", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("phone landscape fits Play and the deck on the first screen (#431)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "viewport is set by the test; one project is enough");
    await openLobby(page);
    await expect(page.locator(".home-brand")).toBeHidden();
    const vp = page.viewportSize()!;
    for (const sel of [".btn-play", ".home-deck"]) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box, sel).not.toBeNull();
      expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(0);
      expect(box.x, `${sel} left`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height);
      expect(box.x + box.width, `${sel} right`).toBeLessThanOrEqual(vp.width);
    }
  });
});
