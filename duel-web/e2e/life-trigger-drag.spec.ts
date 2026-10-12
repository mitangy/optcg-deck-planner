/**
 * The Life check pop-up (only the Life card and its buttons) drags by the thin
 * row above the card, like other pop-ups drag by their header (#565).
 * SHOTS=1 also saves screenshots to /mnt/project-files/life-trigger-drag/.
 */
import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOTS = "/mnt/project-files/life-trigger-drag";
const PROMPT = ".prompt-hide-wrap .life-trigger-card";
const GRIP = `${PROMPT} > .life-trigger-tools`;
const touch = () => test.info().project.name === "phone-375";

async function open(page: Page) {
  await page.goto("/demo?prompt=trigger");
  await expect(page.locator(PROMPT)).toBeVisible();
  await page.waitForTimeout(400);
  return (await page.locator(".life-trigger-card .card-tile").boundingBox())!;
}

/** Drag the row above the card by (dx, dy): mouse on desktop, a finger on phones. */
async function dragRow(page: Page, dx: number, dy: number) {
  const g = (await page.locator(GRIP).boundingBox())!;
  const start = { x: g.x + 12, y: g.y + g.height / 2 };
  if (touch()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let i = 1; i <= 8; i += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (dx * i) / 8, y: start.y + (dy * i) / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up();
}

const tile = (page: Page) => page.locator(".life-trigger-card .card-tile").boundingBox().then((b) => b!);

test("dragging the Life check's top row moves it, and the next one opens there (#565)", async ({ page }) => {
  const before = await open(page);
  await dragRow(page, -40, -150);
  const after = await tile(page);
  expect(after.y).toBeCloseTo(before.y - 150, 0);
  if (!touch()) expect(after.x).toBeCloseTo(before.x - 40, 0);
  // The demo keeps one prompt up, so a reload (a fresh prompt, settings kept) stands in for the next.
  await page.reload();
  await expect(page.locator(PROMPT)).toBeVisible();
  await expect.poll(async () => (await tile(page)).y).toBeCloseTo(after.y, 0);
  if (process.env.SHOTS && !touch()) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/dragged-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });
  }
  // Its buttons still answer after a drag.
  await page.getByRole("button", { name: "Activate Trigger" }).click();
  await expect.poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents)).toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("double-clicking the Life check's top row puts it back (#565)", async ({ page }) => {
  test.skip(touch(), "double-click is a mouse gesture");
  const before = await open(page);
  await dragRow(page, 0, -150);
  expect((await tile(page)).y).toBeLessThan(before.y - 100);
  const g = (await page.locator(GRIP).boundingBox())!;
  await page.mouse.dblclick(g.x + 12, g.y + g.height / 2);
  expect((await tile(page)).y).toBeCloseTo(before.y, 0);
});

test("the Life check's top row keeps Hide, the size buttons and the card where they were (#565)", async ({ page }) => {
  const card = await open(page);
  const row = (await page.locator(GRIP).boundingBox())!;
  expect(row.height).toBeLessThan(40);
  expect(row.y + row.height).toBeLessThanOrEqual(card.y + 1);
  const hide = (await page.locator(`${GRIP} .prompt-hide`).boundingBox())!;
  expect(hide.x + hide.width).toBeLessThanOrEqual(row.x + row.width + 1);
  await expect(page.locator(`${GRIP} .popup-size-btns button`)).toHaveCount(2);
  const vw = page.viewportSize()!.width;
  if (vw <= 640) expect(Math.abs(card.x + card.width / 2 - vw / 2)).toBeLessThanOrEqual(2);
  if (process.env.SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${process.env.SHOT_PREFIX ?? "after"}-${vw}x${page.viewportSize()!.height}.png` });
  }
});
