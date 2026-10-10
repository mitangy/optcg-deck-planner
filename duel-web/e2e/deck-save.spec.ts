/**
 * The deck editor's Save button (#481): edits are a draft until Save, and leaving with unsaved edits asks first.
 * The API is not needed (the editor only calls /auth/me, which 404s to signed-out); the editor and saved deck are real.
 *
 * SHOTS=1 also saves screenshots to /mnt/project-files/deck-save/.
 */
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

  const save = page.getByRole("button", { name: /^(Save|Saved)$/ });
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await expect(save).toHaveText("Saved");
  await expect(save).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  const clean = await save.boundingBox();
  await shot("clean");

  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();
  await expect(page.locator("article.deck-stack", { hasText: "ST01-006" }).getByLabel("3 copies")).toBeVisible();
  await expect(save).toHaveText("Save");
  await expect(save).toBeEnabled();
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);
  // Saved -> Save does not move or resize the button.
  await page.evaluate(() => window.scrollTo(0, 0));
  const dirty = await save.boundingBox();
  expect(Math.abs(dirty!.x - clean!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(dirty!.y - clean!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(dirty!.width - clean!.width)).toBeLessThanOrEqual(1);
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
  await expect(save).toHaveText("Save");
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);

  // Discard puts the saved deck back.
  await discard.click();
  await expect(save).toHaveText("Saved");
  await expect(page.locator("article.deck-stack", { hasText: "ST01-006" }).getByLabel("4 copies")).toBeVisible();
  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();

  await save.click();
  await expect(save).toHaveText("Saved");
  await expect(save).toBeDisabled();
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length - 1);

  // Leaving with nothing unsaved goes straight through.
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
  const save = page.getByRole("button", { name: /^(Save|Saved)$/ });
  const dialog = page.getByRole("dialog", { name: /Save changes to Red Vanilla\?/ });
  const chopper = page.getByRole("button", { name: "Remove one Tony Tony.Chopper" });
  const openEditor = async () => {
    await page.goto("/decks");
    await page.locator(".deck-list li", { hasText: "Red Vanilla" }).click();
    await expect(page).toHaveURL(/configure$/);
    await expect(save).toHaveText("Saved");
  };

  // Keep editing: Back stays on the editor with the edits; a second Back asks again.
  await openEditor();
  await chopper.click();
  await expect(save).toHaveText("Save");
  await page.goBack();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/configure$/);
  await shot("back-dialog");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(save).toHaveText("Save");
  await page.goBack();
  await expect(dialog).toBeVisible();

  // Discard goes where Back was heading, with the saved deck untouched.
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length);

  // Save goes there too, with the edit stored, and Back from the list does not land on a stuck editor entry.
  await openEditor();
  await chopper.click();
  await page.goBack();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  expect(await storedCards(page)).toBe(RED_VANILLA.cards.length - 1);
  await page.goForward();
  await expect(page).toHaveURL(/configure$/);
  await expect(dialog).toHaveCount(0);

  // Saving in place drops the guard: Back is not swallowed by a leftover entry.
  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();
  await save.click();
  await expect(save).toHaveText("Saved");
  await page.goBack();
  await expect(page).toHaveURL(/\/decks$/);
  await expect(dialog).toHaveCount(0);

  // A link click while dirty, then Discard, leaves no guard entry behind: Back returns to the list in one step.
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
