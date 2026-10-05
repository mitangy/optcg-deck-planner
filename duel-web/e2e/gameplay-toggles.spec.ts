/**
 * Gameplay switches that hide a UI aid (#301): each aid shows by default on
 * the demo board and is gone with its switch off.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const HAND_CARD = ":is(.hand-fan-cards, .rail-hand-cards, .hand-dock-cards, .hand-row-inner) > .card-tile";

async function openDemo(page: Page, query: string, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
}

/** Mouse-drag your summoning-sick Character a little: an attack attempt it can't make. */
async function tryAttackWithSickCharacter(page: Page) {
  const box = (await page.locator('.side-you [data-instance-id="y-c1"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 6 });
  await page.mouse.up();
}

test("hand cards show their Counter badge by default (#301)", async ({ page }) => {
  await openDemo(page, "", {});
  await expect(page.locator(`${HAND_CARD} .counter-badge`).first()).toBeAttached();
});

test("Counter values on hand cards off leaves the hand cards without Counter badges (#301)", async ({ page }) => {
  await openDemo(page, "", { handCounters: false });
  await expect(page.locator(HAND_CARD).first()).toBeAttached();
  await expect(page.locator(`${HAND_CARD} .counter-badge`)).toHaveCount(0);
});

test("a battle draws the attack arc by default (#301)", async ({ page }) => {
  await openDemo(page, "", {});
  await expect(page.locator(".attack-overlay")).toBeAttached();
});

test("Battle arrow off draws no attack arc during a battle (#301)", async ({ page }) => {
  await openDemo(page, "", { battleArrow: false });
  await expect(page.locator(".zone-trash").first()).toBeAttached();
  await page.waitForTimeout(500);
  await expect(page.locator(".attack-overlay")).toHaveCount(0);
});

test("a sick Character's attack attempt flashes the can't-attack warning by default (#301)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "mouse drag");
  await openDemo(page, "?cantattack", {});
  await tryAttackWithSickCharacter(page);
  await expect(page.locator(".attack-warning")).toBeVisible();
});

test("Can't attack warning off: a sick Character's attack attempt shows no warning (#301)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "mouse drag");
  await openDemo(page, "?cantattack", { cantAttackWarning: false });
  await tryAttackWithSickCharacter(page);
  // The warning shows within a frame and clears itself after ~2.4s, so check
  // once now rather than retrying until it would have gone anyway.
  await page.waitForTimeout(300);
  expect(await page.locator(".attack-warning").count()).toBe(0);
  expect(await page.locator("[data-cant-attack]").count()).toBe(0);
});

const spaceTag = (page: Page) =>
  page.locator(".primary-dock.has-primary").evaluate((el) => getComputedStyle(el, "::after").content);

test("action buttons show their Space and letter key tabs by default (#301)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "key tabs are for mouse and keyboard");
  await openDemo(page, "?attack", {});
  await expect.poll(() => spaceTag(page)).toBe('"Space"');
  await page.locator('.side-you [data-instance-id="y-leader"]').click();
  await expect(page.locator("[data-key-tag]").first()).toBeAttached();
});

test("Shortcut key tags off hides the Space and letter tabs on the action buttons (#301)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "key tabs are for mouse and keyboard");
  await openDemo(page, "?attack", { shortcutTags: false });
  await expect.poll(() => spaceTag(page)).toBe("none");
  await page.locator('.side-you [data-instance-id="y-leader"]').click();
  await expect(page.locator(".card-action-btn, .intent-btn").first()).toBeAttached();
  await expect(page.locator("[data-key-tag]")).toHaveCount(0);
});
