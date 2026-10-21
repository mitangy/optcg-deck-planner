/**
 * Phone pop-ups and the defend tray (#660): tall pop-ups stop under the top bar
 * so Undo stays in reach, and the tray that replaces the hand shows its size.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

test.use({ legacyLayout: false });

const phoneOnly = () => test.skip(test.info().project.name !== "phone-375", "phone layout");

async function openDemo(page: Page, query: string, popupSize = 100) {
  await page.addInitScript((size) => {
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ popupSize: size }));
  }, popupSize);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(500);
}

/** Undo is the real topmost thing at its centre, and `top` (the pop-up's top edge) is below the bar. */
async function expectUndoReachable(page: Page, popupTop: number) {
  const undo = page.locator(".hud-undo-btn").first();
  await expect(undo).toBeVisible();
  const hit = await undo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && el.contains(at);
  });
  expect(hit, "Undo is not covered").toBe(true);
  const barBottom = await page.locator(".hud-bar").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(popupTop).toBeGreaterThanOrEqual(barBottom - 0.5);
}

test("a look pop-up on a portrait phone stays under the top bar so Undo works (#660)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 375, height: 667 });
  await openDemo(page, "?undo&prompt=look");
  const head = page.locator(".float-layer .float-head").first();
  await expect(head).toBeVisible();
  await expectUndoReachable(page, (await head.boundingBox())!.y);
});

for (const prompt of ["order", "trigger"]) {
  test(`the ${prompt} pop-up at Pop-up size 160% stays under the top bar on a portrait phone (#660)`, async ({ page }) => {
    phoneOnly();
    await page.setViewportSize({ width: 375, height: 667 });
    await openDemo(page, `?undo&prompt=${prompt}`, 160);
    const box = page.locator(".ability-prompt, .float-stage-free").first();
    await expect(box).toBeVisible();
    const top = await page.evaluate(() => {
      const tops = [...document.querySelectorAll(".ability-prompt, .float-stage-free, .float-layer .float-head, .life-trigger-tools")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0)
        .map((r) => r.top);
      return Math.min(...tops);
    });
    await expectUndoReachable(page, top);
    // Its Confirm row stays inside the pop-up's box (the Life card shrinks to fit instead of spilling down).
    const spill = await page.evaluate(() => {
      const prompt = document.querySelector(".ability-prompt");
      const actions = prompt?.querySelector(".ability-prompt-actions");
      return prompt && actions ? actions.getBoundingClientRect().bottom - prompt.getBoundingClientRect().bottom : 0;
    });
    expect(spill).toBeLessThanOrEqual(2);
  });
}

test("answering an attack on a portrait phone shows how many cards are in your hand (#660)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?counter");
  const pill = page.locator(".defend-tray .defend-hand");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/^Hand \d+$/);
  const tray = await page.locator(".defend-tray").boundingBox();
  expect(tray!.height).toBeCloseTo(159, 0);
  const verdict = (await page.locator(".defend-verdict").boundingBox())!;
  const p = (await pill.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(verdict.x + verdict.width - 1);
  expect(p.x + p.width).toBeLessThanOrEqual(375);
  // Staging a counter shows the hand after it and moves nothing.
  const chip = page.locator(".defend-chips .defend-chip").first();
  const before = await chip.boundingBox();
  await chip.click();
  await expect(pill).toHaveText(/^Hand \d+ → \d+$/);
  const after = await chip.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.x).toBeCloseTo(before!.x, 0);
  expect((await page.locator(".defend-tray").boundingBox())!.height).toBeCloseTo(159, 0);
});

test("answering an attack on a landscape phone shows the hand count without moving the chips (#660)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 812, height: 375 });
  await openDemo(page, "?counter");
  const pill = page.locator(".defend-tray .defend-hand");
  await expect(pill).toBeVisible();
  const col = await page.locator(".arena-rail").boundingBox();
  const p = (await pill.boundingBox())!;
  expect(p.x + p.width).toBeLessThanOrEqual(col!.x + col!.width + 0.5);
  const chip = page.locator(".defend-chips .defend-chip").first();
  const before = await chip.boundingBox();
  await chip.click();
  await expect(pill).toHaveText(/^Hand \d+ → \d+$/);
  const after = await chip.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.x).toBeCloseTo(before!.x, 0);
});

test("the desktop defend rail does not repeat the hand count (#660)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "desktop layout");
  await openDemo(page, "?counter");
  await expect(page.locator(".defend-tray")).toBeVisible();
  await expect(page.locator(".defend-hand")).toHaveCount(0);
});
