/**
 * Alt arts on the planner can be bought (#906): an Owned | Buy switch turns the
 * alt tile steppers into "copies to buy of this art". The Base tile shows what is
 * left, and the picks are priced into Remaining and Est. cost.
 */
import type { Page } from "@playwright/test";
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // needs 4, owns 2 -> 2 still needed; one alt at $14.99, base $1.25
const ALT = 201;

const izoCard = (page: Page) =>
  page.locator(`tr:has-text("${IZO}"):visible, .mobile-card-list > *:has-text("${IZO}"):visible, .grid-card:has-text("${IZO}"):visible`).first();
const switchGroup = (page: Page) => page.getByRole("group", { name: "Alt art steppers" }).locator("visible=true").first();
const buyTab = (page: Page) => switchGroup(page).getByRole("button", { name: "Buy", exact: true });

async function shot(page: Page, name: string, testInfo: { project: { name: string } }) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/altBuy906-${testInfo.project.name}-${name}.png` });
}

test("Buy mode: + on an alt moves a still-needed copy off Base and reprices Remaining and Est. cost (#906)", async ({ page, planner }, testInfo) => {
  await planner.open("/");
  await expect(izoCard(page)).toBeVisible();
  const estBefore = await page.getByLabel("Shopping totals").locator("visible=true").first().textContent().catch(() => null);

  // Owned is the default: Izo's alt tile has an Owned stepper and no Buy one.
  await expect(buyTab(page)).toHaveAttribute("aria-pressed", "false");
  await expect(izoCard(page).getByRole("button", { name: /Increase owned for Izo \(/ })).toBeVisible();

  await buyTab(page).click();
  await expect(buyTab(page)).toHaveAttribute("aria-pressed", "true");
  await expect(izoCard(page).getByRole("button", { name: /Increase owned for/ })).toHaveCount(0);
  await expect(izoCard(page).locator(".alt-buy-base")).toContainText("Buy ×2");
  await shot(page, "buy-mode", testInfo);

  await izoCard(page).getByRole("button", { name: /Increase buy for/ }).click();

  await expect(izoCard(page).locator(".alt-buy-base")).toContainText("Buy ×1");
  // 1 alt at $14.99 + 1 base at $1.25 (was 2 x $1.25).
  await expect(izoCard(page)).toContainText(/\$16\.24/);
  await expect(izoCard(page)).not.toContainText(/\$2\.50/);
  if (testInfo.project.name === "desktop-1200") await expect(izoCard(page).locator(".remaining-split")).toHaveText("1 alt + 1 base");
  expect(planner.altWants.get(`${IZO}:${ALT}`)).toBe(1);
  expect(planner.requests).toContain(`PUT /cards/${IZO}/printings/${ALT}`);
  const estAfter = await page.getByLabel("Shopping totals").locator("visible=true").first().textContent().catch(() => null);
  if (estBefore != null) expect(estAfter).not.toBe(estBefore);

  // The last still-needed copy goes to the alt too: + is then disabled everywhere.
  await izoCard(page).getByRole("button", { name: /Increase buy for/ }).click();
  await expect(izoCard(page).locator(".alt-buy-base")).toContainText("Buy ×0");
  await expect(izoCard(page).getByRole("button", { name: /Increase buy for/ })).toBeDisabled();
  await expect(izoCard(page)).toContainText(/\$29\.98/);
  await shot(page, "all-picked", testInfo);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("The Owned | Buy choice survives a reload and Owned mode is unchanged (#906)", async ({ page, planner }) => {
  await planner.open("/");
  await buyTab(page).click();
  await page.reload();
  await expect(buyTab(page)).toHaveAttribute("aria-pressed", "true");
  await expect(izoCard(page).getByRole("button", { name: /Increase buy for/ })).toBeVisible();

  await switchGroup(page).getByRole("button", { name: "Owned", exact: true }).click();
  await expect(izoCard(page).getByRole("button", { name: /Increase owned for Izo \(/ })).toBeVisible();
  await expect(izoCard(page).getByRole("button", { name: /Increase buy for/ })).toHaveCount(0);
});

test("Deck page Buy mode saves the pick on the deck with the deck-level endpoint (#906)", async ({ page, planner }) => {
  await planner.open("/decks/1");
  await buyTab(page).click();
  const card = page.locator(`[data-card-id="${IZO}"]:visible`).first();
  await card.getByRole("button", { name: /Increase buy for/ }).click();
  await expect(card.locator(".alt-buy-base")).toContainText("Buy ×1");
  expect(planner.requests).toContain(`PUT /decks/1/cards/${IZO}/printings/${ALT}`);
  expect(planner.altWants.get(`${IZO}:${ALT}`)).toBe(1);
});

test("Collection and grid keep the switch where it belongs (#906)", async ({ page, planner }, testInfo) => {
  await planner.open("/collection");
  await expect(page.getByRole("group", { name: "Alt art steppers" })).toHaveCount(0);

  await planner.open("/");
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  await expect(switchGroup(page)).toBeVisible();
  await buyTab(page).click();
  await expect(izoCard(page).getByRole("button", { name: /Increase buy for/ })).toBeVisible();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(scroll).toBe(true);
  await shot(page, "grid", testInfo);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
