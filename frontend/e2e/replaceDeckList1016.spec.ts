/**
 * Replace with deck list (#1016): overwrite an existing deck from a pasted deck code, from the More menu and from the
 * Edit deck panel. Runs at desktop-1200 and phone-375. Set SHOTS_DIR to save screenshots for the PR body.
 */
import type { Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";

const LIST = "1xEB01-001\n4xEB01-003\n2xEB01-009";

async function shot(page: Page, name: string, project: string) {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${project}-${name}.png` });
}

test.beforeEach(async ({ planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("More menu replaces the deck with the pasted list and keeps its name (#1016)", async ({ page, planner }, info) => {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Replace with deck list/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Replace Oden Red/Green?" })).toBeVisible();
  const replace = dialog.getByRole("button", { name: "Replace deck" });
  await expect(replace).toBeDisabled();
  await dialog.getByLabel("Deck code").fill(LIST);
  await shot(page, "1-dialog", info.project.name);
  await replace.click();
  await expect(dialog).toHaveCount(0);
  expect(planner.replacedLists).toEqual([LIST]);
  await expect(page.getByRole("status").filter({ hasText: "Replaced with the pasted list (7 cards)." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  // Izo was not in the pasted list, Kid & Killer was.
  await expect(page.locator('[data-card-id="EB01-002"]:visible')).toHaveCount(0);
  await expect(page.locator('[data-card-id="EB01-003"]:visible').first()).toBeVisible();
  await shot(page, "2-replaced", info.project.name);
});

test("Edit deck panel opens the same dialog, and Cancel changes nothing (#1016)", async ({ page, planner }, info) => {
  await page.getByRole("button", { name: "Edit deck" }).click();
  await page.getByRole("button", { name: "Replace with deck list" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Deck code")).toBeVisible();
  await shot(page, "3-edit-panel-dialog", info.project.name);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(planner.replacedLists).toEqual([]);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator('[data-card-id="EB01-002"]:visible').first()).toBeVisible();
  await page.getByRole("button", { name: "Edit deck" }).click();
  await shot(page, "4-edit-panel", info.project.name);
});
