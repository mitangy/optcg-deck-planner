/**
 * Centred prompts drag by their header (#324): they move with the pointer,
 * stay on screen, keep working where they land, and a double-click puts them back.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const PROMPT = ".prompt-hide-wrap .ability-prompt";
const touch = () => test.info().project.name === "phone-375";

async function open(page: Page) {
  await page.goto("/demo?prompt=confirm");
  await expect(page.locator(".choice-confirm")).toBeVisible();
  return (await page.locator(PROMPT).boundingBox())!;
}

/** Drag the header by (dx, dy): mouse on desktop, a finger on phones. */
async function dragHeader(page: Page, dx: number, dy: number) {
  const h = (await page.locator(`${PROMPT} > h3`).boundingBox())!;
  const start = { x: h.x + 40, y: h.y + h.height / 2 };
  const end = { x: start.x + dx, y: start.y + dy };
  if (touch()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let i = 1; i <= 8; i += 1) {
      const p = { x: start.x + (dx * i) / 8, y: start.y + (dy * i) / 8 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test("dragging a prompt's header moves it, and its buttons still answer (#324)", async ({ page }) => {
  const before = await open(page);
  await dragHeader(page, -40, -200);
  const after = (await page.locator(PROMPT).boundingBox())!;
  expect(after.y).toBeCloseTo(before.y - 200, 0);
  if (!touch()) expect(after.x).toBeCloseTo(before.x - 40, 0);
  await page.locator(".choice-confirm").getByRole("button", { name: "Yes" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("a dragged prompt stays on screen (#324)", async ({ page }) => {
  await open(page);
  // Straight up: letting go at the screen's left edge would dock it instead (#449).
  await dragHeader(page, 0, -2000);
  const box = (await page.locator(PROMPT).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(7.5);
  expect(box.y).toBeGreaterThanOrEqual(7.5);
});

test("double-clicking a moved prompt's header puts it back (#324)", async ({ page }) => {
  test.skip(touch(), "double-click is a mouse gesture");
  const before = await open(page);
  await dragHeader(page, 0, -200);
  await page.locator(`${PROMPT} > h3`).dblclick({ position: { x: 40, y: 10 } });
  const after = (await page.locator(PROMPT).boundingBox())!;
  expect(after.y).toBeCloseTo(before.y, 0);
  // The saved spot is cleared too: the next pop-up opens centred.
  await page.reload();
  await expect(page.locator(".choice-confirm")).toBeVisible();
  expect((await page.locator(PROMPT).boundingBox())!.y).toBeCloseTo(before.y, 0);
});

test("the next prompt opens where the last one was dragged (#422)", async ({ page }) => {
  const before = await open(page);
  await dragHeader(page, -40, -200);
  const dropped = (await page.locator(PROMPT).boundingBox())!;
  // The demo keeps one prompt up, so a reload (a fresh prompt, settings kept) stands in for the next.
  await page.reload();
  await expect(page.locator(".choice-confirm")).toBeVisible();
  await expect.poll(async () => (await page.locator(PROMPT).boundingBox())!.y).toBeCloseTo(dropped.y, 0);
  expect(dropped.y).toBeLessThan(before.y - 100);
  expect((await page.locator(PROMPT).boundingBox())!.x).toBeCloseTo(dropped.x, 0);
});

/** The prompt's box lies fully inside the viewport. */
async function onScreen(page: Page) {
  const box = (await page.locator(PROMPT).boundingBox())!;
  const vp = page.viewportSize()!;
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
}

test("a prompt dragged during a battle stays on screen where it was dropped (#335)", async ({ page }) => {
  test.skip(touch(), "the prompt only dodges the attacked card on the wide desktop board");
  // Your Leader is under attack, so the prompt opens at the top of the board.
  await page.goto("/demo?prompt=confirm&attacked");
  await expect(page.locator(".choice-confirm")).toBeVisible();
  // Down and to the right, clear of your Leader: the dodge used to flip it to
  // the bottom spot with the drag still applied, off the bottom of the screen.
  await dragHeader(page, 300, 380);
  await page.waitForTimeout(200);
  const dropped = (await page.locator(PROMPT).boundingBox())!;
  expect(await onScreen(page)).toBe(true);
  // A second drag still finds the header where it was left.
  await dragHeader(page, -60, -40);
  await page.waitForTimeout(200);
  const after = (await page.locator(PROMPT).boundingBox())!;
  expect(after.x).toBeCloseTo(dropped.x - 60, 0);
  expect(after.y).toBeCloseTo(dropped.y - 40, 0);
  expect(await onScreen(page)).toBe(true);
});
