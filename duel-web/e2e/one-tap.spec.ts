/**
 * One-tap actions (#502): a card whose pop-up holds a single button does it on
 * the first tap, and an effect that wants exactly N picks resolves on the Nth.
 * A pop-up with a real choice (several buttons) still opens.
 */
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const HAND_CARD = ":is(.hand-fan-cards, .rail-hand-cards, .hand-dock-cards, .hand-row-inner) > .card-tile";
const YOU = (id: string) => `.side-you [data-instance-id="${id}"]`;

const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

async function openDemo(page: Page, query: string, oneTap: boolean) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), { oneTapActions: oneTap });
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
}

/** A tap on phones, a click on desktop. */
async function press(page: Page, target: Locator) {
  if (test.info().project.name === "phone-375") await target.tap();
  else await target.click();
}

for (const [name, size] of [["portrait", null], ["landscape", { width: 812, height: 375 }]] as const) {
  test.describe(`${name}`, () => {
    test.beforeEach(async ({ page }) => {
      if (size) {
        test.skip(test.info().project.name !== "phone-375", "landscape phone only");
        await page.setViewportSize(size);
      }
    });

    test(`one-tap plays a hand card whose pop-up is just Play (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "", true);
      await press(page, page.locator(HAND_CARD).nth(2));
      await expect.poll(async () => (await sent(page)).map((i) => (i as { type: string }).type)).toEqual(["play_card"]);
      await expect(page.locator(".card-actions")).toHaveCount(0);
    });

    test(`without one-tap the same hand card opens its Play pop-up and sends nothing (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "", false);
      await press(page, page.locator(HAND_CARD).nth(2));
      await expect(page.locator(".card-actions").getByRole("button", { name: /Play/ })).toBeVisible();
      expect(await sent(page)).toEqual([]);
    });

    test(`one-tap attacks at once when Attack is the card's only button (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "?cantattack&attackready", true);
      await press(page, page.locator(YOU("y-c3")));
      await expect.poll(() => sent(page)).toEqual([{ type: "declare_attack", attackerId: "y-c3", target: { kind: "leader" } }]);
    });

    test(`one-tap keeps the pop-up for a Leader with +1 / +2 and Attack (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "?cantattack&dons&attackready", true);
      await press(page, page.locator(YOU("y-leader")));
      await expect(page.locator(".card-actions").getByRole("button", { name: /Attack/ })).toBeVisible();
      expect(await sent(page)).toEqual([]);
    });

    test(`one-tap gives a lone +1 DON!! at once (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "?cantattack&dons&attackready", true);
      await press(page, page.locator(YOU("y-c1")));
      await expect.poll(async () => (await sent(page)).map((i) => (i as { type: string; targetId?: string }).type + ":" + (i as { targetId?: string }).targetId)).toEqual(["give_don:y-c1"]);
    });

    test(`Double-click with One-tap actions inspects without playing the card (#513) [${name}]`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop-1280", "double-click is a mouse gesture");
      await openDemo(page, "", true);
      await page.locator(HAND_CARD).nth(2).dblclick();
      await expect(page.locator(".card-inspect, [role=dialog]").first()).toBeVisible();
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([]);
    });

    test(`Double-click with One-tap actions inspects a board card without attacking (#513) [${name}]`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop-1280", "double-click is a mouse gesture");
      await openDemo(page, "?cantattack&attackready", true);
      await page.locator(YOU("y-c3")).dblclick();
      await expect(page.locator(".card-inspect, [role=dialog]").first()).toBeVisible();
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([]);
    });

    test(`Long-press with One-tap actions inspects without playing the card (#513) [${name}]`, async ({ page }) => {
      test.skip(test.info().project.name !== "phone-375", "long-press is a touch gesture");
      await openDemo(page, "", true);
      const box = (await page.locator(HAND_CARD).nth(2).boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await page.waitForTimeout(900);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.locator(".card-inspect, [role=dialog]").first()).toBeVisible();
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([]);
    });

    test(`one-tap answers DON!! -2 on the second pick without Confirm (#502) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=don2", true);
      await expect(page.locator(".field-bar")).toBeVisible();
      // The Leader holds two DON!!: each tap on it picks one more (the field bar covers the cost area on landscape phones).
      await press(page, page.locator(YOU("y-leader")).first());
      await expect(page.locator(".field-bar-count")).toHaveText("Choose 2 · selected 1");
      expect(await sent(page)).toEqual([]);
      await expect(page.locator(".field-bar, .intent-bar").getByRole("button", { name: "Confirm" })).toBeVisible();
      await press(page, page.locator(YOU("y-leader")).first());
      await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o6", "o7"] }]);
    });
  });
}
