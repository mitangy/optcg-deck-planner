/**
 * Holding a card on a phone must not bring up the browser's image sheet (iOS
 * Save / Share) or start an image drag or text selection, and the app's own
 * press-and-hold must still open the card inspector (#445).
 *
 * Chromium has no `-webkit-touch-callout`, so the test reads what it does
 * support from the same rule (`user-select`, `-webkit-user-drag`) and the
 * `draggable` attribute; when the engine knows the callout property it checks that too.
 * Hand and field tiles already had `user-select: none` and `draggable="false"`, so only the
 * card inspector's art (no tile around it) shows the stylesheet rule at work in Chromium; the
 * callout line itself can only be checked on iOS Safari.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const props = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      userSelect: cs.userSelect,
      userDrag: cs.getPropertyValue("-webkit-user-drag"),
      callout: CSS.supports("-webkit-touch-callout", "none") ? cs.getPropertyValue("-webkit-touch-callout") : "none",
      draggable: (el as HTMLImageElement).draggable,
    };
  });

test("a held hand card's art has no image callout, drag or selection (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "phone behavior");
  await page.goto("/demo?full");
  await page.locator(".hand-row-inner .card-tile img").first().waitFor();
  expect(await props(page, ".hand-row-inner .card-tile img")).toMatchObject({ userSelect: "none", callout: "none", draggable: false });
  expect(await props(page, ".side-you .card-tile img")).toMatchObject({ userSelect: "none", callout: "none", draggable: false });
});

test("press-and-hold on a hand card still opens the inspector, and its art is not selectable (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "phone behavior");
  await page.goto("/demo?full");
  const card = page.locator(".hand-row-inner .card-tile").first();
  await card.waitFor();
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".card-inspect")).toBeVisible();
  expect(await props(page, ".card-inspect-img")).toEqual({ userSelect: "none", userDrag: "none", callout: "none", draggable: false });
});
