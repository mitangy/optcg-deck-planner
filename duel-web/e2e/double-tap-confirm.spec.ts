/**
 * Double-click / double-tap a card while an effect asks you to choose (#1287):
 * it picks the card and confirms in one go, with One-tap actions off. Phones
 * use two quick taps (our own timing: iOS doesn't reliably fire dblclick).
 */
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const YOU = (id: string) => `.side-you [data-instance-id="${id}"]`;
const OPP = (id: string) => `.side-opp [data-instance-id="${id}"]`;
const HAND_CARD = (id: string) => `:is(.hand-fan-cards, .rail-hand-cards, .hand-dock-cards, .hand-row-inner) > .card-tile[data-motion-id="${id}"]`;

const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

async function openDemo(page: Page, query: string) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), { oneTapActions: false });
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
}

/** A double-click on desktop, two quick taps on phones. */
async function doubleActivate(page: Page, target: Locator) {
  if (test.info().project.name === "phone-375") {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else {
    await target.dblclick();
  }
}

const answer = (...ids: string[]) => ({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });

for (const [name, size] of [["portrait", null], ["landscape", { width: 812, height: 375 }]] as const) {
  test.describe(`${name}`, () => {
    test.beforeEach(async ({ page }) => {
      if (size) {
        test.skip(test.info().project.name !== "phone-375", "landscape phone only");
        await page.setViewportSize(size);
      }
    });

    test(`double-tap on a board target picks it and confirms an up-to-1 choice (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=select");
      await expect(page.locator(".field-bar")).toBeVisible();
      await doubleActivate(page, page.locator(OPP("o-c1")));
      await expect.poll(() => sent(page)).toEqual([answer("o0")]);
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([answer("o0")]);
      await expect(page.locator(".card-inspect-backdrop")).toHaveCount(0);
    });

    test(`a single tap on a board target only picks it (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=select");
      const tile = page.locator(OPP("o-c1"));
      if (test.info().project.name === "phone-375") await tile.tap();
      else await tile.click();
      await expect(page.locator(".field-bar, .intent-bar").getByRole("button", { name: "Confirm" })).toBeEnabled();
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([]);
      await expect(page.locator(".field-bar, .intent-bar").getByRole("button", { name: "Confirm" })).toBeEnabled();
    });

    test(`double-tap on a pop-up card picks it and confirms (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=selectgrid");
      await expect(page.locator(".choice-grid")).toBeVisible();
      await doubleActivate(page, page.locator(".choice-grid .choice-option .card-tile").first());
      await expect.poll(() => sent(page)).toEqual([answer("o0")]);
      await page.waitForTimeout(500);
      expect(await sent(page)).toEqual([answer("o0")]);
      await expect(page.locator(".card-inspect-backdrop")).toHaveCount(0);
    });

    test(`double-tap on a searched card takes it and confirms with the rest put back (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=look");
      await expect(page.locator(".float-row")).toBeVisible();
      await doubleActivate(page, page.locator(".float-card.is-eligible").nth(1));
      await expect.poll(() => sent(page)).toEqual([{ ...answer("o2"), orderedOptionIds: ["o0", "o1", "o3", "o4"] }]);
      await page.waitForTimeout(500);
      expect((await sent(page)).length).toBe(1);
    });

    test(`double-tap on a hand card picks it and confirms an up-to-2 choice (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=hand");
      await expect(page.locator(".field-bar")).toBeVisible();
      await doubleActivate(page, page.locator(HAND_CARD("y-h5")));
      await expect.poll(() => sent(page)).toEqual([answer("o0")]);
    });

    test(`double-tap on a Leader with 2 DON!! under it takes the second and confirms DON!! -2 (#1287) [${name}]`, async ({ page }) => {
      await openDemo(page, "?prompt=don2");
      await expect(page.locator(".field-bar")).toBeVisible();
      await doubleActivate(page, page.locator(YOU("y-leader")).first());
      await expect.poll(() => sent(page)).toEqual([answer("o6", "o7")]);
      await page.waitForTimeout(500);
      expect((await sent(page)).length).toBe(1);
    });
  });
}
