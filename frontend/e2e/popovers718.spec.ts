/**
 * The planner's popovers on the shared Headless UI Popover (#718): the deck page's Share panel, the market price's
 * recent sales (list, grid), the Sort panel and the build-hint popover. Each opens without moving its trigger or its
 * neighbours, stays open while its controls are used, and closes on Escape (focus back on the trigger) and on a tap
 * outside. Runs at desktop-1200 and phone-375.
 */
import type { Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

test.beforeEach(async ({ planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

/** A point on the page no popover covers, near the bottom edge. */
const outside = (page: Page) => page.mouse.click(page.viewportSize()!.width / 2, page.viewportSize()!.height - 3);

async function expectBelowAndOnScreen(page: Page, trigger: ReturnType<Page["locator"]>, panel: ReturnType<Page["locator"]>) {
  const box = (await panel.boundingBox())!;
  const t = (await trigger.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
  // Under the trigger, or flipped above it when there is no room, but never over it.
  const overlaps = box.x < t.x + t.width && box.x + box.width > t.x && box.y < t.y + t.height && box.y + box.height > t.y;
  expect(overlaps, "the panel covers its own trigger").toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test("Share opens a panel on screen without moving its button, Escape and a tap outside close it (#718)", async ({ page }) => {
  const share = page.locator("button.head-popover-btn", { hasText: "Share" });
  await expectStationary(share, () => share.click(), "Share");
  const panel = page.getByRole("dialog", { name: "Share and export" });
  await expect(panel).toBeVisible();
  await expectBelowAndOnScreen(page, share, panel);
  // A click leaves no focus ring on the trigger (Headless UI focuses it from script, which Chrome counts as the keyboard).
  await expect(share).toHaveCSS("outline-style", "none");

  // Using the panel does not close it.
  await panel.getByRole("heading", { name: "Public link" }).click();
  await expect(panel).toBeVisible();

  await expectStationary(share, () => page.keyboard.press("Escape"), "Share closing");
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();

  await share.click();
  await expect(panel).toBeVisible();
  await outside(page);
  await expect(panel).toHaveCount(0);
});

test("Tab from the Share button walks into its panel, and Escape from inside hands focus back (#718)", async ({ page }) => {
  const share = page.locator("button.head-popover-btn", { hasText: "Share" });
  await share.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Share and export" });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Create public link" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(share).toBeFocused();
  // Opened and closed with the keyboard, the trigger shows its focus ring.
  await expect(share).toHaveCSS("outline-style", "solid");
});

for (const layout of ["List", "Grid"] as const) {
  test(`a market price in the ${layout} layout opens its sales without moving or resizing, loading included (#718)`, async ({ page }) => {
    // Hold the sales back so the loading state is on screen while the trigger is measured.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/catalog/sales/*", async (route) => {
      await held;
      await route.fallback();
    });
    await page.getByRole("button", { name: layout, exact: true }).click();
    const price = page.locator("button.market-price-btn:visible").first();
    await price.scrollIntoViewIfNeeded();
    await expectStationary(price, () => price.click(), `market price (${layout})`);
    const panel = page.getByRole("region", { name: "Last 3 sold prices" });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".skeleton-inline")).toBeVisible();
    await expectBelowAndOnScreen(page, price, panel);

    // The list arriving changes the panel, never the price.
    await expectStationary(price, async () => {
      release();
      await expect(panel.getByRole("listitem")).toHaveCount(3);
    }, `market price (${layout}) loading`);
    await expectBelowAndOnScreen(page, price, panel);

    await expectStationary(price, () => page.keyboard.press("Escape"), `market price (${layout}) closing`);
    await expect(panel).toHaveCount(0);
    await expect(price).toBeFocused();

    await price.click();
    await expect(panel).toBeVisible();
    await outside(page);
    await expect(panel).toHaveCount(0);
  });
}

test("the Sort panel stays open while its checkboxes and arrows are used, is reached with Tab, and Escape closes it (#718)", async ({ page }) => {
  const filters = page.getByRole("button", { name: /^Filters/ });
  if (!(await page.getByRole("button", { name: /^Sort:/ }).isVisible())) await filters.click();
  const sort = page.getByRole("button", { name: /^Sort:/ });
  // What sits beside the trigger must not be shoved either.
  const neighbour = page.getByLabel("Show alt arts");
  await expectStationary(neighbour, () => sort.click(), "Show alt arts beside Sort");
  const panel = page.getByRole("dialog", { name: "Sort order" });
  await expect(panel).toBeVisible();
  await expectBelowAndOnScreen(page, sort, panel);

  const price = panel.getByLabel("Price");
  await price.check();
  await expect(panel).toBeVisible();
  await expect(sort).toContainText("Price");
  await panel.getByRole("button", { name: "Move Price up" }).click();
  // Price went above Set and the arrow it was clicked with is still there; one more press and it is first, so the arrow goes inactive under the pointer.
  await panel.getByRole("button", { name: "Move Price up" }).click();
  await expect(panel.getByRole("button", { name: "Move Price up" })).toBeDisabled();
  await expect(panel).toBeVisible();

  // Tab walks the panel's controls in order (the panel is reached from the keyboard, not just the pointer).
  await panel.getByRole("checkbox", { name: "Color" }).focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Move Color up" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Move Color down" })).toBeFocused();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(sort).toBeFocused();

  await sort.click();
  await expect(panel).toBeVisible();
  await outside(page);
  await expect(panel).toHaveCount(0);
});

test("a build hint opens in a popover that Escape and a tap outside close, with its chip left where it was (#718)", async ({ page }) => {
  if (page.viewportSize()!.width < 1000) await page.getByRole("button", { name: /^Stats/ }).click();
  const chip = page.locator('[data-hint-id="count"]:visible');
  await expectStationary(chip, () => chip.click(), "hint chip");
  const pop = page.locator(".dh-pop");
  await expect(pop).toBeVisible();
  await expectBelowAndOnScreen(page, chip, pop);
  await expectStationary(chip, () => page.keyboard.press("Escape"), "hint chip closing");
  await expect(pop).toHaveCount(0);
  await expect(chip).toBeFocused();

  await chip.click();
  await expect(pop).toBeVisible();
  // Another chip's press puts this one away.
  const other = page.locator("[data-hint-id]:visible").nth(1);
  if (await other.count()) {
    await other.click();
    await expect(pop).toHaveCount(1);
  }
  await outside(page);
  await expect(pop).toHaveCount(0);
});
