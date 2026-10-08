/**
 * Dragging a grayed-out (unaffordable) hand card (#364): the card lifts out of
 * its slot and follows the pointer like any other hand card, and the lift ends
 * with the drag even when the drag stops being allowed halfway through.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const UNAFFORDABLE =
  ".hand-fan-cards > .card-tile.hand-unaffordable, .hand-row-inner > .card-tile.hand-unaffordable, .rail-hand-cards > .card-tile.hand-unaffordable, .hand-dock-cards > .card-tile.hand-unaffordable";

async function openDemo(page: Page) {
  await page.goto("/demo?unaffordable");
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(800);
}

/** Press on the first unaffordable card and drag it up out of the hand. */
async function pickUp(page: Page, dy: number) {
  const card = page.locator(UNAFFORDABLE).first();
  await expect(card).toBeAttached();
  const touch = test.info().project.name === "phone-375";
  let b = (await card.boundingBox())!;
  if (!touch) {
    await page.mouse.move(b.x + b.width / 2, b.y + 12);
    await page.waitForTimeout(450);
    b = (await card.boundingBox())!;
  }
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const end = { x: start.x, y: start.y - dy };
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  const move = async (p: { x: number; y: number }) => {
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
    else await page.mouse.move(p.x, p.y, { steps: 8 });
    await page.waitForTimeout(120);
  };
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
  }
  await move({ x: start.x, y: start.y - 16 });
  await move(end);
  const release = async () => {
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
  };
  return { card, end, move, release };
}

test("a dragged grayed-out hand card leaves its slot empty like any other (#364)", async ({ page }) => {
  await openDemo(page);
  const { card, release } = await pickUp(page, 30);
  await expect(page.locator(".hand-lift")).toHaveCount(1);
  expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await release();
  await expect(page.locator(".hand-lift")).toHaveCount(0);
});

test("a hand card drag cut short by Sort lets the lifted copy go (#364)", async ({ page }) => {
  await openDemo(page);
  const { end, move, release } = await pickUp(page, 200);
  await expect(page.locator(".hand-lift")).toHaveCount(1);
  // Sorting turns hand reordering off mid-drag, which drops the card's drag handlers.
  await page
    .locator(".hand-rail-btn", { hasText: "Sort" })
    .locator("visible=true")
    .first()
    .evaluate((el) => (el as HTMLElement).click());
  await release();
  // A mouse keeps moving after the release; a lifted copy that still follows it is the bug.
  if (test.info().project.name !== "phone-375") await move({ x: end.x + 40, y: end.y + 40 });
  await expect(page.locator(".hand-lift")).toHaveCount(0);
  await expect
    .poll(() => page.locator(UNAFFORDABLE).first().evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
});
