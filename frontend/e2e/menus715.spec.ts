/**
 * The deck page's More menu on the shared Headless UI Menu (#715): it opens fully on screen under its button
 * without moving it, arrow keys and Enter work, Escape hands focus back, and Hide from friends still works.
 * Runs at desktop-1200 and phone-375.
 */
import { expect, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

test.beforeEach(async ({ planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("More opens on screen under its button, moves nothing and the page does not scroll sideways (#715)", async ({ page }) => {
  const more = page.getByRole("button", { name: "More" });
  await expectStationary(more, () => more.click(), "More");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  // Right-aligned under the button, not over it.
  const t = (await more.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(t.y + t.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expectStationary(more, () => page.keyboard.press("Escape"), "More closing");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("arrow keys walk the More menu, Enter picks a row and Escape returns focus to the button (#715)", async ({ page, planner }) => {
  const more = page.getByRole("button", { name: "More" });
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const rows = menu.getByRole("menuitem");
  const active = () => menu.evaluate((el) => document.getElementById(el.getAttribute("aria-activedescendant") ?? "")?.textContent ?? "");
  expect(await active()).toContain("Hide from friends");
  await page.keyboard.press("End");
  expect(await active()).toContain("Reset owned counts");
  await page.keyboard.press("Home");
  expect(await active()).toContain("Hide from friends");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  // Enter on the first row hides the deck from friends and closes the menu.
  await page.keyboard.press("ArrowDown");
  await expect(rows.first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => planner.deckHidden).toBe(true);
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("a tap outside the More menu closes it (#715)", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 4);
  await expect(menu).toHaveCount(0);
});
