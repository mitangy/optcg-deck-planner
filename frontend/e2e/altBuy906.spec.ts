/**
 * Buying alt arts from the planner (#906): on a card with alt arts that still needs copies, its
 * remaining price opens a "Buy your N copies as…" popover (a bottom sheet on phones) that splits
 * them between the base art and each alt. The picks reprice Remaining and Est. cost, show as
 * "Buy ×N" on the alt tiles and save with the same want group buys use.
 */
import type { Page } from "@playwright/test";
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // needs 4, owns 2 -> 2 still needed; one alt (201) at $14.99, base $1.25
const ALT = 201;

const trigger = (page: Page) => page.locator(`[data-buy-split="${IZO}"]:visible`).first();
const dialog = (page: Page) => page.getByRole("dialog", { name: "Buy Izo as" });
const incAlt = (page: Page) => dialog(page).getByRole("button", { name: /^Increase .* to buy$/ }).first();
const estCost = (page: Page) => page.getByLabel("Shopping totals").locator("visible=true").first().textContent();

async function shot(page: Page, name: string, testInfo: { project: { name: string } }) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/altBuy906-${testInfo.project.name}-${name}.png` });
}

test("Master Shopping: the remaining price splits the buy between base and alt arts (#906)", async ({ page, planner }, testInfo) => {
  await planner.open("/");
  await expect(trigger(page)).toBeVisible();
  await expect(trigger(page)).toContainText("$2.50");
  await expect(trigger(page)).not.toContainText("alt");
  const estBefore = await estCost(page);
  const before = await trigger(page).boundingBox();

  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("Buy your 2 copies as…");
  await expect(dialog(page).getByLabel("Base copies to buy")).toHaveText("×2");
  await expect(dialog(page)).toContainText("Total$2.50");
  // Opening the panel does not move the trigger.
  expect(await trigger(page).boundingBox()).toEqual(before);
  await shot(page, "popover-open", testInfo);

  if (testInfo.project.name === "phone-375") {
    const viewport = page.viewportSize()!;
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1); // pinned to the bottom edge
    const buttons = await dialog(page).getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of buttons) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
  } else {
    const viewport = page.viewportSize()!;
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await incAlt(page).click();
  await expect(dialog(page).getByLabel("Base copies to buy")).toHaveText("×1");
  await expect(dialog(page)).toContainText("Total$16.24");
  // 1 alt at $14.99 + 1 base at $1.25 (was 2 x $1.25).
  await expect(trigger(page)).toContainText("$16.24");
  await expect(trigger(page)).toContainText("1 alt + 1 base");
  expect(planner.altWants.get(`${IZO}:${ALT}`)).toBe(1);
  expect(planner.requests).toContain(`PUT /cards/${IZO}/printings/${ALT}`);
  expect(await estCost(page)).not.toBe(estBefore);

  // Escape closes it and focus returns to the trigger.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await shot(page, "after-pick", testInfo);

  // The alt's tile says how many are bought, read-only.
  const tile = page.locator(".alt-want-label:visible", { hasText: "Buying ×1" });
  await expect(tile).toHaveCount(1);
  await expect(tile).not.toHaveRole("button");

  // The last still-needed copy goes to the alt too: + is then disabled with the reason.
  await trigger(page).click();
  await incAlt(page).click();
  await expect(dialog(page).getByLabel("Base copies to buy")).toHaveText("×0");
  await expect(incAlt(page)).toHaveAttribute("aria-disabled", "true");
  await expect(incAlt(page)).toHaveAttribute("title", "All 2 still-needed copies are already picked");
  await expect(trigger(page)).toContainText("$29.98");
  await expect(trigger(page)).toContainText("2 alt");

  // Audit the page itself, not the open sheet over its dimmed backdrop.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("Phone: the page behind the buy split sheet is dimmed and a tap on it closes the sheet (#906)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "the bottom sheet is phone only");
  await planner.open("/");
  const backdrop = page.getByTestId("buy-split-backdrop");
  await expect(backdrop).toHaveCount(0);
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("opacity", "1");
  const viewport = page.viewportSize()!;
  const shade = await backdrop.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor };
  });
  // Covers the whole screen with a see-through dark shade.
  expect(shade).toMatchObject({ x: 0, y: 0, w: viewport.width, h: viewport.height });
  expect(shade.bg).toMatch(/rgba\(\d+, \d+, \d+, 0\.[1-9]/);
  // The list above the sheet is under the shade; the sheet itself stays on top of it.
  const top = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 40)?.getAttribute("data-testid"));
  expect(top).toBe("buy-split-backdrop");
  const sheet = (await dialog(page).boundingBox())!;
  const onSheet = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[role="dialog"]')), [sheet.x + sheet.width / 2, sheet.y + 20]);
  expect(onSheet).toBe(true);
  await shot(page, "sheet-backdrop", testInfo);

  await page.mouse.click(viewport.width / 2, 40);
  await expect(dialog(page)).toBeHidden();
  await expect(backdrop).toHaveCount(0);
});

test("Deck page: the still-needed price opens the split and saves the deck want (#906)", async ({ page, planner }, testInfo) => {
  await planner.open("/decks/1");
  await expect(trigger(page)).toBeVisible();
  await trigger(page).click();
  await incAlt(page).click();
  await expect(dialog(page).getByLabel("Base copies to buy")).toHaveText("×1");
  await expect(trigger(page)).toContainText("1 alt + 1 base");
  expect(planner.requests).toContain(`PUT /decks/1/cards/${IZO}/printings/${ALT}`);
  expect(planner.altWants.get(`${IZO}:${ALT}`)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-card-id="${IZO}"]:visible .alt-want-label`, { hasText: "Buying ×1" })).toHaveCount(1);
  await shot(page, "deck-after", testInfo);
  if (testInfo.project.name === "desktop-1200") {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shot(page, "deck-after-1440", testInfo);
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
    await shot(page, "deck-grid-1440", testInfo);
  }
});

test("the grid shows the split and fits (#906)", async ({ page, planner }, testInfo) => {
  await planner.open("/");
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  await expect(trigger(page)).toBeVisible();
  await trigger(page).click();
  await incAlt(page).click();
  await expect(trigger(page)).toContainText("1 alt + 1 base");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await shot(page, "grid", testInfo);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
