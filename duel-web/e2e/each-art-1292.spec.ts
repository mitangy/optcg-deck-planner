/**
 * "One of each art" (#1292): a deck can show a different art on every copy of an any-number card (Sleeptids,
 * OP18-093). The board spreads copies over the standard art and the alternates by the copy rank in the view
 * (8 copies over 3 arts: 3 / 3 / 2); the deck editor offers the option on that card only.
 *
 * Runs in one project and resizes itself: desktop, phone portrait and phone landscape (fresh touch contexts, so
 * the phone layout is the real one). Set PR_SHOTS_DIR to save screenshots of each screen.
 */
import { mkdirSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const SIZES = [
  { name: "desktop", width: 1440, height: 900, phone: false },
  { name: "phone-portrait", width: 375, height: 812, phone: true },
  { name: "phone-landscape", width: 812, height: 375, phone: true },
] as const;

const SLEEPTIDS = "OP18-093";
const DECK_ID = "e2e-each-art";
const DECKS_KEY = "optcg.duel.savedDecks.v1";
const PREFS_KEY = "optcg.duel.artPrefs.v1";
/** What each copy of Sleeptids shows: the standard art (its file name varies with the preview chain), then the two alternates. */
const STANDARD = /OP18-093\.(png|webp)$/;
const ALT_2 = /OP18-093-2\.webp$/;
const ALT_3 = /OP18-093-3\.webp$/;

async function shot(page: Page, name: string, size: (typeof SIZES)[number]) {
  const dir = process.env.PR_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/each-art-${name}-${size.name}-${size.width}x${size.height}.png` });
}

async function withSize(browser: Browser, size: (typeof SIZES)[number], run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: size.phone,
    isMobile: size.phone,
    baseURL: process.env.E2E_PAGE_ORIGIN,
  });
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    await context.close();
  }
}

/** The `src` of each tile's picture, in DOM order. */
const srcs = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute("src") ?? ""));

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "resizes itself: desktop, phone portrait and phone landscape");
});

for (const size of SIZES) {
  test(`the board shows each Sleeptids copy with its own art at ${size.name} (#1292)`, async ({ browser }) => {
    await withSize(browser, size, async (page) => {
      await page.addInitScript(
        ([prefs]) => {
          localStorage.setItem(prefs!, JSON.stringify({ "OP18-093": "each" }));
          // No "Your turn" banner over the mats; the main phase has no battle arrow either.
          localStorage.setItem("optcg-duel:settings", JSON.stringify({ turnSplash: false }));
        },
        [PREFS_KEY],
      );
      await page.goto("/demo?eachart&cantattack");
      await page.locator(".board-root").waitFor();
      const field = page.locator(`.side-you .zone-characters .card-tile:has(img[alt="Sleeptids"]) img`);
      await expect(field).toHaveCount(3);
      // Copies 0, 1 and 2 on the field: one of each art, standard first.
      await expect.poll(async () => (await srcs(page, `.side-you .zone-characters .card-tile:has(img[alt="Sleeptids"]) img`)).map((s) => [STANDARD, ALT_2, ALT_3].findIndex((re) => re.test(s)))).toEqual([0, 1, 2]);
      // The opponent's copy 0 shows the standard art on its own mat.
      await expect.poll(async () => (await srcs(page, `.side-opp .zone-characters .card-tile img[alt="Sleeptids"]`)).map((s) => STANDARD.test(s))).toEqual([true]);
      await shot(page, "board", size);
      // Copies 3 and 4 in hand wrap round: standard, then the first alternate (hand cards are reachable by their motion id).
      for (const [id, re] of [["y-s3", STANDARD], ["y-s4", ALT_2]] as const) {
        const tile = page.locator(`[data-motion-id="${id}"] img`);
        await expect.poll(async () => (await tile.getAttribute("src")) ?? "").toMatch(re);
      }
      // Nothing sideways, whatever the size.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test("the deck editor offers One of each art on an any-number card and spreads the copies (#1292)", async ({ browser }) => {
  for (const size of SIZES) {
    await withSize(browser, size, async (page) => {
      await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
      const deck = { id: DECK_ID, name: "Sleeptids", leaderId: "OP02-093", cards: [...Array(8).fill(SLEEPTIDS), ...Array(4).fill("OP17-119")], updatedAt: 1 };
      await page.addInitScript(([key, d]) => localStorage.setItem(key!, JSON.stringify([d])), [DECKS_KEY, deck] as const);
      await page.goto(`/decks/${DECK_ID}/configure`);
      const sleeptids = page.locator("article.deck-stack", { hasText: SLEEPTIDS });
      const loki = page.locator("article.deck-stack", { hasText: "OP17-119" });
      await expect(sleeptids).toHaveCount(1);

      if (!size.phone) {
        // Desktop: the Artwork dropdown. Only the any-number card lists the option.
        await loki.locator(".deck-stack-art-select").click();
        await expect(page.getByRole("option", { name: "Standard" })).toBeVisible();
        await expect(page.getByRole("option", { name: "One of each art" })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await sleeptids.locator(".deck-stack-art-select").click();
        await shot(page, "deck-editor-picker-open", size);
        await page.getByRole("option", { name: "One of each art" }).click();
        await expect(sleeptids.locator(".deck-stack-art-select")).toHaveText(/One of each art/);
      } else {
        // Phones hide the Artwork row: the card sheet has the same choice.
        await sleeptids.locator(".deck-stack-name-btn").click();
        await expect(page.getByRole("button", { name: "One of each art" })).toBeVisible();
        await shot(page, "deck-editor-card-sheet", size);
        await page.getByRole("button", { name: "One of each art" }).click();
        await page.getByRole("button", { name: "Done" }).click();
      }

      // Saved on the deck, and the pile of copies shows a different art on each layer.
      const saved = await page.evaluate(([key]) => JSON.parse(localStorage.getItem(key!) ?? "[]")[0].artPrefs, [DECKS_KEY]);
      expect(saved).toEqual({ [SLEEPTIDS]: "each" });
      await expect.poll(async () => (await srcs(page, `article.deck-stack:has-text("${SLEEPTIDS}") .card-stack-copy img`)).slice(0, 3).map((s) => [ALT_2, ALT_3, STANDARD].findIndex((re) => re.test(s)))).toEqual([0, 1, 2]);
      await sleeptids.scrollIntoViewIfNeeded();
      await shot(page, "deck-editor-selected", size);
    });
  }
});
