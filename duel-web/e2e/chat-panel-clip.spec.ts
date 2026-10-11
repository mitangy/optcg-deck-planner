/**
 * The chat panel's input row is never cut off (#529): dragging the divider above
 * it as far as it goes, or a short window with every panel in one column, makes
 * the message list shrink and scroll, not the Send row disappear.
 *
 * SHOTS=1 saves screenshots to /mnt/project-files/card-preview-popup/.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOT_DIR = "/mnt/project-files/card-preview-popup";

async function openDemo(page: Page, settings: Record<string, unknown>, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), { previewPopup: false, ...settings });
  await page.goto("/demo?chat");
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(400);
}

/** Send row and message list sit inside the chat panel and the window. */
async function expectInputVisible(page: Page) {
  const panel = (await page.locator('[data-panel="chat"]').boundingBox())!;
  const form = (await page.locator('[data-panel="chat"] .chat-form').boundingBox())!;
  const send = (await page.locator('[data-panel="chat"] .chat-send').boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(form.y + form.height, "input row bottom inside the panel").toBeLessThanOrEqual(panel.y + panel.height + 1);
  expect(send.y + send.height, "Send inside the panel").toBeLessThanOrEqual(panel.y + panel.height + 1);
  expect(send.y + send.height, "Send inside the window").toBeLessThanOrEqual(vh);
  expect(send.y, "Send below the panel top").toBeGreaterThanOrEqual(panel.y);
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop side columns");
});

test("dragging the divider above chat all the way down keeps its input row visible (#529)", async ({ page }) => {
  await openDemo(page, { sideColumns: "both" }, { width: 1280, height: 720 });
  const divider = page.locator('[role="separator"][aria-label$="and Chat"]');
  const h = (await divider.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + 2000, { steps: 10 });
  await page.mouse.up();
  if (process.env.SHOTS) await page.screenshot({ path: `${SHOT_DIR}/chat-divider-${process.env.CHAT_SHOT ?? "after"}.png` });
  await expectInputVisible(page);
});

test("chat in the one combined column of a short window keeps its input row visible (#529)", async ({ page }) => {
  await openDemo(page, { sideColumns: "right" }, { width: 1280, height: 720 });
  if (process.env.SHOTS) await page.screenshot({ path: `${SHOT_DIR}/chat-one-column-${process.env.CHAT_SHOT ?? "after"}.png` });
  await expectInputVisible(page);
});
