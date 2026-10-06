/**
 * Picks from your hand (#341): on portrait phones the Confirm / None buttons
 * sit bottom right in End turn's slot, not in the bar at the top of the
 * screen; landscape phones keep the whole bar at the bottom of the board.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

async function pickFromHand(page: Page) {
  await page.goto("/demo?prompt=hand");
  await expect(page.locator(".field-bar")).toBeVisible();
  await page.locator('.board-root [data-motion-id="y-h5"]').first().click();
}

test("hand pick Confirm sits bottom right where End turn is on portrait phones (#341)", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-375", "portrait phone layout");
  await pickFromHand(page);
  const confirm = page.locator(".intent-bar").getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeVisible();
  await expect(page.locator(".field-bar").getByRole("button")).toHaveCount(0);
  const box = (await confirm.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(vp.height - 70);
  expect(box.x + box.width).toBeGreaterThan(vp.width - 20);
  await confirm.click();
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"] }]);
});

test("hand pick bar stays at the bottom of the board on landscape phones (#341)", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-375", "phone layout");
  await page.setViewportSize({ width: 812, height: 375 });
  await pickFromHand(page);
  const confirm = page.locator(".field-bar").getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeVisible();
  const box = (await confirm.boundingBox())!;
  expect(box.y).toBeGreaterThan(375 / 2);
});

test("hand pick bar stays between the mats on desktop (#341)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "desktop layout");
  await pickFromHand(page);
  await expect(page.locator(".field-bar.field-bar-mid").getByRole("button", { name: "Confirm" })).toBeVisible();
});

test("a scrolling pop-up keeps its Confirm row in view on landscape phones (#341)", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-375", "phone layout");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/demo?prompt=selectgrid");
  const prompt = page.locator(".ability-prompt");
  const button = prompt.getByRole("button", { name: "Choose none" });
  await expect(button).toBeVisible();
  // The demo's pop-up is taller than the screen allows, so it scrolls.
  expect(await prompt.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const box = (await button.boundingBox())!;
  const frame = (await prompt.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
});
