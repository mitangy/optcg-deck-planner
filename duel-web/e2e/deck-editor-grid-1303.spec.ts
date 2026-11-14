/**
 * Phone deck editor as a grid of stacks (#1303): at 599px and below the deck is three columns of stacked piles
 * with the - n + stepper right under each pile, not one row per card. Tablet and desktop keep their tiles.
 *
 * Runs in one project and resizes itself (fresh touch contexts, so the phone layout is the real one). Set
 * PR_SHOTS_DIR to save screenshots of each screen.
 */
import { mkdirSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const DECK_ID = "e2e-deck-grid";
const DECKS_KEY = "optcg.duel.savedDecks.v1";
/** 15 unique cards, 1 to 4 copies each (46 cards), so stacks of every depth show. */
const COUNTS = [4, 3, 2, 1, 4, 2, 3, 1, 4, 2, 3, 1, 4, 2, 3];
const CARD_IDS = COUNTS.map((_, i) => `ST01-${String(i + 2).padStart(3, "0")}`);
const CARDS = CARD_IDS.flatMap((id, i) => Array<string>(COUNTS[i]!).fill(id));

type Size = { name: string; width: number; height: number; phone: boolean };
const PORTRAIT: Size = { name: "phone-portrait", width: 375, height: 812, phone: true };
const NARROW: Size = { name: "phone-narrow", width: 320, height: 700, phone: true };
const LANDSCAPE: Size = { name: "phone-landscape", width: 812, height: 375, phone: true };
const DESKTOP: Size = { name: "desktop", width: 1440, height: 900, phone: false };

async function shot(page: Page, name: string, size: Size) {
  const dir = process.env.PR_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/deck-grid-${name}-${size.name}-${size.width}x${size.height}.png` });
}

async function openEditor(browser: Browser, size: Size, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: size.phone,
    isMobile: size.phone,
    baseURL: process.env.E2E_PAGE_ORIGIN,
  });
  const page = await context.newPage();
  try {
    await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
    const deck = { id: DECK_ID, name: "Straw Hat Rush", leaderId: "ST01-001", cards: CARDS, updatedAt: 1 };
    await page.addInitScript(([key, d]) => localStorage.setItem(key!, JSON.stringify([d])), [DECKS_KEY, deck] as const);
    await page.goto(`/decks/${DECK_ID}/configure`);
    await expect(page.locator(".deck-editor-deck article.deck-stack")).toHaveCount(CARD_IDS.length);
    // Main deck heading at the top, under the sticky header and count bar.
    await page.evaluate((up) => {
      document.querySelector(".deck-editor-deck h2")?.scrollIntoView({ block: "start" });
      window.scrollBy(0, -up);
    }, size.width < 600 ? 130 : 90);
    await run(page);
  } finally {
    await context.close();
  }
}

const box = async (page: Page, selector: string, nth = 0) => {
  const b = await page.locator(selector).nth(nth).boundingBox();
  if (!b) throw new Error(`${selector} #${nth} has no box`);
  return b;
};

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "resizes itself: phone portrait, narrow, landscape and desktop");
});

test("phone deck editor shows the deck as a 3-column grid of stacks with the stepper under each card (#1303)", async ({ browser }) => {
  for (const size of [PORTRAIT, NARROW]) {
    await openEditor(browser, size, async (page) => {
      const tiles = ".deck-editor-deck article.deck-stack";
      const a = await box(page, tiles, 0);
      const b = await box(page, tiles, 1);
      const c = await box(page, tiles, 2);
      const d = await box(page, tiles, 3);
      // Three tiles share a row, side by side; the fourth starts the next row.
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(Math.abs(a.y - c.y)).toBeLessThan(1);
      expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + 1);
      expect(d.y).toBeGreaterThan(a.y + a.height - 1);
      expect(Math.abs(d.x - a.x)).toBeLessThan(1);

      // Inside a tile: the pile on top, the stepper directly under it and as wide as the tile's content.
      const pile = await box(page, `${tiles} >> nth=0 >> .deck-stack-pile`);
      const stepper = await box(page, `${tiles} >> nth=0 >> .deck-stack-stepper`);
      expect(stepper.y).toBeGreaterThanOrEqual(pile.y + pile.height - 1);
      expect(stepper.width).toBeGreaterThan(pile.width * 0.9);
      const minus = await box(page, `${tiles} >> nth=0 >> button[aria-label^="Remove one"]`);
      expect(minus.height).toBeGreaterThanOrEqual(40);
      expect(minus.width).toBeGreaterThanOrEqual(size === NARROW ? 24 : 30);

      // No name, code, Remove or Artwork text; the art button still names the card.
      const first = page.locator(tiles).first();
      const name = await first.locator(".deck-stack-name-btn").boundingBox();
      expect(name!.width).toBeLessThanOrEqual(1);
      await expect(first.getByRole("button", { name: /^Remove all/ })).toBeHidden();
      await expect(first.getByRole("button", { name: /^View details for / })).toBeVisible();

      // Nothing sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

      // The leader is one tile the width of one main-deck column.
      const leader = await box(page, ".deck-editor-leader article.deck-stack");
      expect(Math.abs(leader.width - a.width)).toBeLessThan(1);

      await shot(page, "main", size);
      if (size === PORTRAIT) {
        // Tapping + grows the stack and the layout does not move.
        const card = page.locator(tiles).nth(3); // 1 copy
        const before = await card.boundingBox();
        await card.getByRole("button", { name: /^Add one / }).click();
        await expect(card.locator(".deck-stack-qty-label")).toHaveText("2");
        const after = await card.boundingBox();
        expect(after!.y).toBeCloseTo(before!.y, 0);
        expect(after!.height).toBeCloseTo(before!.height, 0);
        await shot(page, "after-plus", size);
        // Tapping the art opens the card sheet.
        await card.getByRole("button", { name: /^View details for / }).click();
        await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
      }
    });
  }
});

test("tablet and desktop deck editor keep their tiles with name and Remove (#1303)", async ({ browser }) => {
  for (const size of [LANDSCAPE, DESKTOP]) {
    await openEditor(browser, size, async (page) => {
      const first = page.locator(".deck-editor-deck article.deck-stack").first();
      await expect(first.locator(".deck-stack-name")).toBeVisible();
      await expect(first.getByRole("button", { name: /^Remove all/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await shot(page, "main", size);
    });
  }
});
