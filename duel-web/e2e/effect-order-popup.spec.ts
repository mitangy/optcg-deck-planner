/**
 * The effect-order pop-up is a free-standing pop-up (#449): it does not gray out the board
 * (the attack stays visible), and its header drags it like every other prompt, the spot
 * shared through the `promptPos` setting.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const STAGE = ".float-stage";
const touch = () => test.info().project.name === "phone-375";

async function open(page: Page) {
  await page.goto("/demo?prompt=effects&attacked");
  await expect(page.locator(`${STAGE} .float-card`).first()).toBeVisible();
  // Let the cards' entrance animation finish.
  await page.waitForTimeout(500);
}

async function dragHead(page: Page, dx: number, dy: number) {
  const h = (await page.locator(`${STAGE} > .float-head`).boundingBox())!;
  const start = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
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

test("ordering simultaneous effects leaves the board undimmed and clickable behind it (#449)", async ({ page }) => {
  await open(page);
  await expect(page.locator(".float-scrim")).toHaveCount(0);
  // The pop-up's layer spans the board column, but only its header, cards and buttons catch the
  // pointer: its empty margins hit the board behind.
  const hits = await page.evaluate(() => {
    const layer = document.querySelector(".float-layer")!.getBoundingClientRect();
    const inset = 4;
    return [
      [layer.left + inset, layer.top + inset],
      [layer.right - inset, layer.top + inset],
      [layer.left + inset, layer.bottom - inset],
      [layer.right - inset, layer.bottom - inset],
    ].map(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest(".float-layer"));
  });
  expect(hits).toEqual([false, false, false, false]);
  // The attacking card behind the pop-up is not dimmed.
  const opacity = await page.evaluate(() => {
    let o = 1;
    for (let n: HTMLElement | null = document.querySelector<HTMLElement>('[data-instance-id="o-c1"]'); n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });
  expect(opacity).toBe(1);
});

test("the effect-order pop-up drags by its header and the next one opens there (#449)", async ({ page }) => {
  await open(page);
  const before = (await page.locator(`${STAGE} > .float-head`).boundingBox())!;
  await dragHead(page, -30, -60);
  const after = (await page.locator(`${STAGE} > .float-head`).boundingBox())!;
  expect(after.y).toBeCloseTo(before.y - 60, 0);
  // A reload (a fresh prompt, settings kept) stands in for the next pop-up.
  await page.reload();
  await expect(page.locator(`${STAGE} .float-card`).first()).toBeVisible();
  await expect.poll(async () => (await page.locator(`${STAGE} > .float-head`).boundingBox())!.y).toBeCloseTo(before.y - 60, 0);
  await page.getByRole("button", { name: "Resolve in this order" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "order_pending_effects", orderedIds: ["e0", "e1", "e2"] }]);
});

test("a header drag does not reorder the cards, a card drag still does (#449)", async ({ page }) => {
  test.skip(touch(), "mouse drag");
  await open(page);
  const ids = () => page.locator(`${STAGE} .float-card`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.floatId));
  expect(await ids()).toEqual(["e0", "e1", "e2"]);
  await dragHead(page, 0, 40);
  expect(await ids()).toEqual(["e0", "e1", "e2"]);
  await page.waitForTimeout(400);
  const a = (await page.locator(`${STAGE} .float-card`).first().boundingBox())!;
  const c = (await page.locator(`${STAGE} .float-card`).last().boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect.poll(ids).toEqual(["e1", "e2", "e0"]);
});
