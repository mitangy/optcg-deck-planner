/**
 * Portrait phones: floating-card pop-ups and the Life trigger card stay off the
 * hand, and their buttons sit bottom right in the bar (#663). Landscape phones
 * keep the buttons in the pop-up.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

test.use({ legacyLayout: false });

const phoneOnly = () => test.skip(test.info().project.name !== "phone-375", "phone layout");
const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

async function openDemo(page: Page, prompt: string) {
  await page.goto(`/demo?prompt=${prompt}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(500);
}

/** How far the lowest pop-up part dips into the hand rail (px; <= 0 when clear). */
async function overlapWithHand(page: Page) {
  return page.evaluate(() => {
    const hand = document.querySelector(".hand-rail")!.getBoundingClientRect();
    const parts = [...document.querySelectorAll(".float-layer .float-head, .float-layer .float-card, .float-layer .float-axis, .float-layer .float-note, .life-trigger-card, .life-trigger-card *")];
    const bottoms = parts.map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom);
    return Math.max(...bottoms) - hand.top;
  });
}

const SIZES = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  // Just tall enough for two rows of cards: the card budget has to hold them clear of the hand.
  { width: 390, height: 741 },
];
const CASES = [
  { prompt: "look", button: "Take none & finish", intent: { type: "resolve_pending_choice", accept: true } },
  { prompt: "satori", button: "Done", intent: { type: "resolve_pending_choice", accept: true } },
  { prompt: "effects", button: "Resolve in this order", intent: { type: "order_pending_effects" } },
  { prompt: "trigger", button: "Activate Trigger", intent: { type: "resolve_pending_choice", accept: true } },
];

for (const size of SIZES) {
  for (const c of CASES) {
    test(`the ${c.prompt} pop-up stays off the hand and its ${c.button} button sits bottom right at ${size.width}x${size.height} (#663)`, async ({ page }) => {
      phoneOnly();
      await page.setViewportSize(size);
      await openDemo(page, c.prompt);
      expect(await overlapWithHand(page)).toBeLessThanOrEqual(0);
      const button = page.locator(".intent-bar").getByRole("button", { name: c.button });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeGreaterThan(size.height - 70);
      // The row ends at the right edge (Activate Trigger is first of two buttons).
      const last = (await page.locator(".intent-prompt-slot button").last().boundingBox())!;
      expect(last.x + last.width).toBeGreaterThan(size.width - 20);
      expect(last.x + last.width).toBeLessThanOrEqual(size.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await button.click();
      await expect.poll(async () => (await sent(page))[0]).toMatchObject(c.intent);
    });
  }
}

// Bigger Pop-up size grows the pop-up: it still fits between the top bar and the hand.
for (const prompt of ["look", "trigger"]) {
  test(`the ${prompt} pop-up at Pop-up size 160% stays between the top bar and the hand (#663)`, async ({ page }) => {
    phoneOnly();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ popupSize: 160 })));
    await openDemo(page, prompt);
    expect(await overlapWithHand(page)).toBeLessThanOrEqual(0);
    const gap = await page.evaluate(() => {
      const bar = document.querySelector(".hud-bar")!.getBoundingClientRect().bottom;
      const tops = [...document.querySelectorAll(".float-layer .float-head, .life-trigger-tools")].map((el) => el.getBoundingClientRect().top);
      return Math.min(...tops) - bar;
    });
    expect(gap).toBeGreaterThanOrEqual(-0.5);
  });
}

test("the look pop-up's hint sits under its title and Hide sits in the bar on a portrait phone (#663)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 375, height: 667 });
  await openDemo(page, "look");
  await expect(page.locator(".float-head .float-note")).toBeVisible();
  const bar = page.locator(".intent-bar");
  const hide = bar.getByRole("button", { name: "Hide" });
  await expect(hide).toBeVisible();
  // Hide still shrinks the pop-up into its pill; the bar's buttons go with it.
  await hide.click();
  await expect(page.getByRole("button", { name: /^Back to/ })).toBeVisible();
  await expect(page.locator(".float-stage")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Take none & finish" })).toHaveCount(0);
});

test("hiding the Life trigger card takes its buttons out of the bottom bar (#663)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 375, height: 667 });
  await openDemo(page, "trigger");
  const bar = page.locator(".intent-bar");
  await expect(bar.getByRole("button", { name: "Activate Trigger" })).toBeVisible();
  await page.locator(".life-trigger-card .prompt-hide").click();
  await expect(page.getByRole("button", { name: /^Back to/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Activate Trigger" })).toHaveCount(0);
});

test("the Life trigger buttons stay in the pop-up on landscape phones (#663)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 812, height: 375 });
  await openDemo(page, "trigger");
  await expect(page.locator(".life-trigger-card").getByRole("button", { name: "Activate Trigger" })).toBeVisible();
  await expect(page.locator(".intent-bar").getByRole("button", { name: "Activate Trigger" })).toHaveCount(0);
});

test("the look pop-up's buttons stay in the pop-up on landscape phones (#663)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 812, height: 375 });
  await openDemo(page, "look");
  await expect(page.locator(".float-stage .float-actions").getByRole("button", { name: "Take none & finish" })).toBeVisible();
  await expect(page.locator(".intent-bar").getByRole("button", { name: "Hide" })).toHaveCount(0);
});
