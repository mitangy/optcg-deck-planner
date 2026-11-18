import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const DECK_ID = "e2e-save";
const KEY = "optcg.duel.savedDecks.v1";
const SHOTS_DIR = "/mnt/project-files/deck-save";

const storedCards = (page: Page) =>
  page.evaluate(
    ([key, id]) => (JSON.parse(localStorage.getItem(key) ?? "[]") as { id: string; cards: string[] }[]).find((d) => d.id === id)?.cards.length,
    [KEY, DECK_ID] as const,
  );

test("deck editor edits stay a draft until Save, and leaving asks first (#481)", async ({ page }, info) => {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await page.addInitScript(
    ([id, deck, key]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA, KEY] as const,
  );
  const shot = async (name: string) => {
    if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/${info.project.name}-${name}.png` });
  };
  await page.goto(`/decks/${DECK_ID}/configure`);

  const save = page.getByRole("button", { name: "Save", exact: true });
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  const saved = page.locator(".deck-saved-status");
  await expect(saved).toHaveText("Saved");
  await expect(save).toHaveCount(0);
  await expect(discard).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("clean");

  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();
  await expect(page.locator("article.deck-stack", { hasText: "ST01-006" }).getByLabel("3 copies")).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(discard).toBeVisible();
  await expect(saved).toHaveCount(0);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("dirty");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Back to decks" }).click();
  const dialog = page.getByRole("dialog", { name: /Save changes to Red Vanilla\?/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/configure$/);
  await shot("leave-dialog");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeVisible();
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);

  await discard.click();
  await expect(saved).toHaveText("Saved");
  await expect(page.locator("article.deck-stack", { hasText: "ST01-006" }).getByLabel("4 copies")).toBeVisible();
  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();

  await save.click();
  await expect(saved).toHaveText("Saved");
  await expect(save).toHaveCount(0);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length - 1);

  await page.getByRole("link", { name: "Back to decks" }).click();
  await expect(page).toHaveURL(/\/decks$/);
});

test("Back with unsaved deck edits asks Save / Discard / Keep editing (#483)", async ({ page }, info) => {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await page.addInitScript(
    ([id, deck, key]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA, KEY] as const,
  );
  const shotDir = process.env.BACK_SHOTS;
  const shot = async (name: string) => {
    if (shotDir) await page.screenshot({ path: `${shotDir}/${info.project.name}-${name}.png` });
  };
  const save = page.getByRole("button", { name: "Save", exact: true });
  const saved = page.locator(".deck-saved-status");
  const dialog = page.getByRole("dialog", { name: /Save changes to Red Vanilla\?/ });
  const chopper = page.getByRole("button", { name: "Remove one Tony Tony.Chopper" });
  const openEditor = async () => {
    await page.goto("/decks");
    await page.locator(".deck-list li", { hasText: "Red Vanilla" }).getByRole("button", { name: "Edit Red Vanilla" }).click();
    await expect(page).toHaveURL(/configure$/);
    await expect(saved).toHaveText("Saved");
  };

  await openEditor();
  await chopper.click();
  await expect(save).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/configure$/);
  await shot("back-dialog");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);

  await openEditor();
  await chopper.click();
  await page.goBack();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length - 1);
  await page.goForward();
  await expect(page).toHaveURL(/configure$/);
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();
  await save.click();
  await expect(saved).toHaveText("Saved");
  await page.goBack();
  await expect(page).toHaveURL(/\/decks$/);
  await expect(dialog).toHaveCount(0);

  await openEditor();
  await chopper.click();
  await page.getByRole("link", { name: "Back to decks" }).click();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  await page.goBack();
  await expect(page).toHaveURL(/configure$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/decks$/);
});
