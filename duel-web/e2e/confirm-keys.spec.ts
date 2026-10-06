/**
 * Yes/No prompt keys (#324): Y or Space answers Yes, N answers No, on the
 * centred Yes/No prompt and on the Yes/No shown on a card used from the hand.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

async function openConfirm(page: Page) {
  await page.goto("/demo?prompt=confirm");
  await expect(page.locator(".choice-confirm")).toBeVisible();
}

test("Y answers Yes on a Yes/No prompt (#324)", async ({ page }) => {
  await openConfirm(page);
  await page.keyboard.press("y");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("N answers No on a Yes/No prompt (#324)", async ({ page }) => {
  await openConfirm(page);
  await page.keyboard.press("n");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: false }]);
});

test("Space answers Yes on a Yes/No prompt (#324)", async ({ page }) => {
  await openConfirm(page);
  await page.keyboard.press("Space");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("Yes/No keys do nothing while typing in a text field (#324)", async ({ page }) => {
  await openConfirm(page);
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "typing-probe";
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.type("yn ");
  await page.waitForTimeout(200);
  expect(await sent(page)).toEqual([]);
  await expect(page.locator(".choice-confirm")).toBeVisible();
});

test("a hidden Yes/No prompt ignores the Yes/No keys (#324)", async ({ page }) => {
  await openConfirm(page);
  await page.locator(".choice-confirm .prompt-hide").first().click();
  await expect(page.locator(".choice-confirm")).toBeHidden();
  await page.keyboard.press("y");
  await page.keyboard.press("n");
  await page.waitForTimeout(200);
  expect(await sent(page)).toEqual([]);
});

test("Y answers Yes on the Yes/No shown on a hand card (#324)", async ({ page }) => {
  test.skip(test.info().project.name === "phone-375", "phones play the Counter from the defend tray, not the hand card");
  await page.goto("/demo?counter=haki");
  await page.locator('.board-root [data-motion-id="y-h6"]').first().click();
  await page.getByRole("button", { name: "Counter event Color of the Supreme King Haki" }).click();
  await expect(page.locator(".hand-confirm")).toBeVisible();
  await page.keyboard.press("y");
  await expect
    .poll(async () => (await sent(page)).filter((i) => (i as { type: string }).type === "resolve_pending_choice"))
    .toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("N answers No on the Yes/No shown on a hand card (#324)", async ({ page }) => {
  test.skip(test.info().project.name === "phone-375", "phones play the Counter from the defend tray, not the hand card");
  await page.goto("/demo?counter=haki");
  await page.locator('.board-root [data-motion-id="y-h6"]').first().click();
  await page.getByRole("button", { name: "Counter event Color of the Supreme King Haki" }).click();
  await expect(page.locator(".hand-confirm")).toBeVisible();
  await page.keyboard.press("n");
  await expect
    .poll(async () => (await sent(page)).filter((i) => (i as { type: string }).type === "resolve_pending_choice"))
    .toEqual([{ type: "resolve_pending_choice", accept: false }]);
});

async function openPrompt(page: Page, prompt: string) {
  await page.goto(`/demo?prompt=${prompt}`);
  await expect(page.locator("button[data-confirm-key]").first()).toBeVisible();
}

test("Space presses Confirm on a card search (#337)", async ({ page }) => {
  await openPrompt(page, "look");
  await page.keyboard.press("Space");
  await expect
    .poll(() => sent(page))
    .toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [], orderedOptionIds: ["o0", "o1", "o2", "o3", "o4"] }]);
});

test("Y presses Confirm order on a deck order prompt (#337)", async ({ page }) => {
  await openPrompt(page, "order");
  await page.keyboard.press("y");
  await expect
    .poll(() => sent(page))
    .toEqual([{ type: "resolve_pending_choice", accept: true, orderedOptionIds: ["o0", "o1"], topOptionIds: ["o0", "o1"] }]);
});

test("Y presses the effect order prompt's Resolve button (#337)", async ({ page }) => {
  await openPrompt(page, "effects");
  await page.keyboard.press("y");
  await expect.poll(() => sent(page)).toEqual([{ type: "order_pending_effects", orderedIds: ["e0", "e1", "e2"] }]);
});

test("Space presses Choose none on a choose-target prompt (#337)", async ({ page }) => {
  await openPrompt(page, "select");
  await page.keyboard.press("Space");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [] }]);
});

test("Y presses None on a pick-from-hand prompt (#337)", async ({ page }) => {
  await openPrompt(page, "hand");
  await page.keyboard.press("y");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [] }]);
});
