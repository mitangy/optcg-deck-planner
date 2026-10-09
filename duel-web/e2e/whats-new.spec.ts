/**
 * The once-per-update "What's new" card in the lobby, and the full list page.
 * The FastAPI backend is faked as a signed-out guest, like e2e/lobby.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";
import { PATCH_NOTES } from "../../packages/patch-notes/src/notes";

const KEY = "optcg.patchNotes.lastSeen.duel";

/** Opens the lobby. `lastSeen` is stored before the first load only (a reload keeps what the app wrote). */
async function openLobby(page: Page, lastSeen: string | null): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  const decks = [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }];
  await page.addInitScript(
    ([d, key, seen]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
      localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
      if (seen) localStorage.setItem(key, seen);
    },
    [decks, KEY, lastSeen] as const,
  );
  await page.goto("/");
  await expect(page.locator(".home-deck")).toBeVisible();
}

const card = (page: Page) => page.getByRole("region", { name: "What's new" });

/** The newest duel-web note: the card leads with it. Read from the notes, so a new note never breaks the spec (#463). */
const NEWEST = PATCH_NOTES.find((n) => n.app === "duel" || n.app === "both")!.title;

test("the card shows after an update and Got it keeps it away, even after a reload (#450)", async ({ page }) => {
  await openLobby(page, "2026-10-05");
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText(NEWEST);
  await expect(card(page)).toContainText("more");

  // It overlays the page: dismissing it moves nothing, and it sits fully on screen.
  const vp = page.viewportSize()!;
  const box = (await card(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const deckBefore = (await page.locator(".home-deck").boundingBox())!;

  await card(page).getByRole("button", { name: "Got it" }).click();
  await expect(card(page)).toBeHidden();
  expect(await page.locator(".home-deck").boundingBox()).toEqual(deckBefore);

  await page.reload();
  await expect(page.locator(".home-deck")).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test("See all opens the full list and the card stays away afterwards (#450)", async ({ page }) => {
  await openLobby(page, "2026-10-05");
  await card(page).getByRole("link", { name: "See all" }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole("heading", { name: "What’s new", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "October 8, 2026" })).toBeVisible();
  await expect(page.getByText("Choose your DON!! art")).toBeVisible();
  // Footer carries the link too.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "What’s new" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).first().click();
  await expect(page.locator(".home-deck")).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test("a first visit shows no card and quietly marks the newest update as seen (#450)", async ({ page }) => {
  await openLobby(page, null);
  await expect(card(page)).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("Settings > About links to the full list (#450)", async ({ page }) => {
  await openLobby(page, "2026-10-05");
  await page.goto("/settings");
  await page.locator("#about").getByRole("link", { name: "What’s new" }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole("heading", { name: "What’s new", level: 1 })).toBeVisible();
});
