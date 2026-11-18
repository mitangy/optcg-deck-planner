import type { Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const KEY = "optcg.duel.savedDecks.v1";

async function fresh(page: Page) {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await page.addInitScript((key) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem(key, "[]");
  }, KEY);
}

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]") as { id: string; name: string; leaderId: string; cards: string[] }[], KEY);

test("a deck made from a picked Leader opens in the editor with that Leader and a default name (#1343)", async ({ page }) => {
  await fresh(page);
  await page.goto("/decks/new");
  await expect(page.getByRole("radio", { name: "Pick a Leader" })).toBeChecked();
  const create = page.getByRole("button", { name: "Create deck" });
  await expect(create).toBeDisabled();
  await page.getByRole("searchbox", { name: "Search Leaders" }).fill("OP01-001");
  const tile = page.locator(".nd-tile");
  await expect(tile).toHaveCount(1);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  await create.click();
  await expect(page).toHaveURL(/\/decks\/[^/]+\/configure$/);
  const decks = await stored(page);
  expect(decks).toHaveLength(1);
  expect(decks[0]).toMatchObject({ leaderId: "OP01-001", cards: [] });
  expect(decks[0]!.name).toMatch(/ deck$/);
  await expect(page.getByRole("textbox", { name: "Deck name" })).toHaveValue(decks[0]!.name);
});

test("pasting a list still creates the deck from that list (#1343)", async ({ page }) => {
  await fresh(page);
  await page.goto("/decks/new");
  await page.getByRole("radio", { name: "Paste a list" }).check();
  await expect(page.getByRole("button", { name: "Create blank deck" })).toBeVisible();
  await page.locator("#new-deck-name").fill("Pasted red");
  await page.locator("#deck-import-text").fill("1xST01-001\n4xST01-003\n4xST01-006");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  await page.getByRole("button", { name: "Import deck" }).click();
  await expect(page).toHaveURL(/\/decks\/[^/]+\/configure$/);
  const decks = await stored(page);
  expect(decks[0]).toMatchObject({ name: "Pasted red", leaderId: "ST01-001" });
  expect(decks[0]!.cards).toHaveLength(8);
});

test("Decks and New deck share one page width, and a deck card has an Edit button (#1343)", async ({ page }) => {
  await fresh(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/decks");
  const header = page.locator(".deck-config-header");
  const decksBox = await header.boundingBox();
  await page.getByRole("button", { name: /^Edit Starter: OP17 Red$/ }).click();
  await expect(page).toHaveURL(/\/decks\/test-op17-red\/configure$/);
  await page.goto("/decks/new");
  const newBox = await page.locator(".deck-config-header").boundingBox();
  expect(Math.abs(decksBox!.x - newBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(decksBox!.width - newBox!.width)).toBeLessThanOrEqual(1);
  expect(decksBox!.width).toBeLessThanOrEqual(1100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
