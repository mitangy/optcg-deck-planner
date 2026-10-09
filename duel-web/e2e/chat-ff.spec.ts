/**
 * `/ff` in the match chat (#449): starts the concede flow with a confirm step
 * instead of posting, and says so inline when conceding isn't available.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const concedes = (page: Page) => page.evaluate(() => (window as { __demoConcedes?: number }).__demoConcedes ?? 0);

async function openChat(page: Page, query: string) {
  await page.goto(`/demo?chat${query}`);
  const toggle = page.locator(".chat-toggle");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator(".chat-input")).toBeVisible();
}

test("/ff asks to confirm, posts nothing, and concedes only on confirm (#449)", async ({ page }) => {
  await openChat(page, "");
  const lines = page.locator(".chat-line");
  const before = await lines.count();
  const input = page.locator(".chat-input");
  await input.fill("/ff");
  await input.press("Enter");

  await expect(page.locator(".chat-command")).toContainText("Concede this match?");
  await expect(input).toHaveValue("");
  await expect(lines).toHaveCount(before);
  expect(await concedes(page)).toBe(0);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".chat-command")).toHaveCount(0);
  expect(await concedes(page)).toBe(0);

  await input.fill("/FF ");
  await input.press("Enter");
  await page.getByRole("button", { name: "Confirm concede" }).click();
  await expect.poll(() => concedes(page)).toBe(1);
  await expect(lines).toHaveCount(before);
});

test("/ff where conceding is unavailable shows a hint without moving the input or posting (#449)", async ({ page }) => {
  await openChat(page, "&practice");
  const lines = page.locator(".chat-line");
  const before = await lines.count();
  const input = page.locator(".chat-input");
  const box = await input.boundingBox();
  await input.fill("/ff");
  await input.press("Enter");

  await expect(page.locator(".chat-command")).toHaveText("You can't concede here");
  await expect(lines).toHaveCount(before);
  expect(await input.boundingBox()).toEqual(box);
  expect(await concedes(page)).toBe(0);
});

test("a message that only contains /ff is still sent as chat (#449)", async ({ page }) => {
  await openChat(page, "");
  const lines = page.locator(".chat-line");
  const before = await lines.count();
  await page.locator(".chat-input").fill("gg /ff");
  await page.locator(".chat-input").press("Enter");
  await expect(lines).toHaveCount(before + 1);
  await expect(lines.last()).toContainText("gg /ff");
  await expect(page.locator(".chat-command")).toHaveCount(0);
});
