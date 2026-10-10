/**
 * Life check (#495): the pop-up is just the Life card, big, floating over the
 * board with its buttons under it. At desktop, portrait-phone and
 * landscape-phone sizes the card and buttons sit fully on screen and the
 * buttons never cover the card.
 */
import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOTS = "/mnt/project-files/trigger-card";
const SIZES = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 812, height: 375 },
];

const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewport sizes");
});

for (const demo of ["trigger", "notrigger"] as const) {
  for (const size of SIZES) {
    test(`${demo} Life check is only the card and its buttons at ${size.width}x${size.height} (#495)`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/demo?prompt=${demo}`);
      const prompt = page.locator(".life-trigger-card");
      await expect(prompt).toBeVisible();
      await expect(prompt.locator("h3")).toHaveCount(0);
      await expect(prompt.locator("p")).toHaveCount(0);
      const tile = prompt.locator(".card-tile");
      await expect(tile).toBeVisible();
      await page.waitForTimeout(500);

      const card = (await tile.boundingBox())!;
      const buttons = prompt.locator(".ability-prompt-actions .btn");
      await expect(buttons).toHaveCount(demo === "trigger" ? 2 : 1);
      expect(card.width).toBeGreaterThan(size.height < 400 ? 120 : 180);
      for (const box of [card, ...(await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON())))]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      for (const b of await buttons.all()) {
        const box = (await b.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(card.y + card.height - 1);
      }
      // Phones pin pop-ups to both edges; the card is centred between them, not left-aligned.
      if (size.width <= 640) expect(Math.abs(card.x + card.width / 2 - size.width / 2)).toBeLessThanOrEqual(2);
      // Hide sits above the card, off its art.
      const hide = (await prompt.locator(".prompt-hide").boundingBox())!;
      expect(hide.y + hide.height).toBeLessThanOrEqual(card.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/${demo}-${size.width}x${size.height}.png` });
    });
  }
}

test("Activate Trigger and Add to hand answer the Life check (#495)", async ({ page }) => {
  await page.goto("/demo?prompt=trigger");
  await page.getByRole("button", { name: "Activate Trigger" }).click();
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true }]);
  await page.getByRole("button", { name: "Add to hand" }).click();
  await expect.poll(() => sent(page)).toEqual([
    { type: "resolve_pending_choice", accept: true },
    { type: "resolve_pending_choice", accept: false },
  ]);
});

test("No Trigger always declines (#495)", async ({ page }) => {
  await page.goto("/demo?prompt=notrigger");
  await page.keyboard.press("y");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: false }]);
});
