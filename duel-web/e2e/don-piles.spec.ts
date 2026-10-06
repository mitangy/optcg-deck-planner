/**
 * Separate DON!! piles (#381): right-clicking a chip in your own cost area
 * offsets it into its own pile, and ten rested DON!! split over piles still fit
 * the rail (they used to spill into the trash pile when the overlap was off).
 */
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

async function openDemo(page: Page) {
  await page.goto("/demo?don=10&rested=10");
  await page.locator(".board-root").waitFor();
}

async function railFits(rail: Locator) {
  return rail.evaluate((el) => {
    const railRight = el.getBoundingClientRect().right;
    const chips = Array.from(el.querySelectorAll<HTMLElement>(".don-chip"));
    const right = Math.max(...chips.map((c) => c.getBoundingClientRect().right));
    return { railRight, right, count: chips.length };
  });
}

async function moveChip(page: Page, index: number) {
  const chip = page.locator(".side-you .don-chip-btn").nth(index);
  // A mouse right-click; a touch long-press fires the same handler, which a
  // synthetic contextmenu stands in for on the phone project.
  if (test.info().project.name.startsWith("phone")) {
    await chip.dispatchEvent("contextmenu");
  } else {
    await chip.click({ button: "right" });
  }
}

test("right-clicking a DON!! offsets it into a second pile that stays inside the rail (#381)", async ({ page }) => {
  await openDemo(page);
  const rail = page.locator(".side-you .don-strip-rail");
  await expect(page.locator(".side-you .don-pile")).toHaveCount(0);

  await moveChip(page, 3);
  await expect(page.locator(".side-you .don-pile")).toHaveCount(2);
  await expect(page.locator(".side-you .don-pile").nth(1).locator(".don-chip-btn")).toHaveCount(1);
  const a = await railFits(rail);
  expect(a.count).toBe(10);
  expect(a.right).toBeLessThanOrEqual(a.railRight + 1);

  // Another chip into pile 2 makes a third pile; the row still ends at the rail edge.
  await moveChip(page, 0);
  await moveChip(page, 0);
  const piles = await page.locator(".side-you .don-pile").count();
  expect(piles).toBeGreaterThanOrEqual(2);
  const b = await railFits(rail);
  expect(b.right).toBeLessThanOrEqual(b.railRight + 1);

  // The opponent's DON!! never form piles.
  await expect(page.locator(".side-opp .don-pile")).toHaveCount(0);
});

test("the lone chip in the last pile goes back to the main pile on the next right-click (#381)", async ({ page }) => {
  await openDemo(page);
  await moveChip(page, 9);
  await expect(page.locator(".side-you .don-pile")).toHaveCount(2);
  await page.locator(".side-you .don-pile").nth(1).locator(".don-chip-btn").click({ button: "right" });
  await expect(page.locator(".side-you .don-pile")).toHaveCount(0);
});

test("holding a DON!! with a finger moves it to another pile and ignores the release click (#381)", async ({ page }) => {
  await openDemo(page);
  const chip = page.locator(".side-you .don-chip-btn").nth(4);
  const fire = (type: string) =>
    chip.evaluate(
      (el, t) => {
        const r = el.getBoundingClientRect();
        const init = { bubbles: true, pointerId: 7, pointerType: "touch", clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0 };
        el.dispatchEvent(new PointerEvent(t, init));
        if (t === "pointerup") el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      type,
    );
  await fire("pointerdown");
  await expect(page.locator(".side-you .don-pile")).toHaveCount(2);
  await fire("pointerup");
  await expect(page.locator(".side-you .don-pile")).toHaveCount(2);
  // Released early, a touch does nothing.
  const quick = page.locator(".side-you .don-pile").nth(0).locator(".don-chip-btn").first();
  await quick.evaluate((el) => {
    const init = { bubbles: true, pointerId: 8, pointerType: "touch", button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", init));
    el.dispatchEvent(new PointerEvent("pointerup", init));
  });
  await page.waitForTimeout(600);
  await expect(page.locator(".side-you .don-pile")).toHaveCount(2);
});

test("separate DON!! piles never overlap each other, with clear space between them (#381)", async ({ page }) => {
  for (const rested of [0, 10]) {
    await page.goto(`/demo?don=10&rested=${rested}`);
    await page.locator(".board-root").waitFor();
    await moveChip(page, 0);
    await moveChip(page, 0);
    await moveChip(page, 9);
    await expect(page.locator(".side-you .don-pile")).toHaveCount(3);
    const { gaps, chipW } = await page.locator(".side-you .don-strip-rail").evaluate((rail) => {
      const piles = Array.from(rail.querySelectorAll(".don-pile")).map((pile) => {
        const rects = Array.from(pile.querySelectorAll(".don-chip")).map((c) => c.getBoundingClientRect());
        return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
      });
      const chip = rail.querySelector<HTMLElement>(".don-chip")!;
      return {
        gaps: piles.slice(1).map((p, i) => p.left - piles[i]!.right),
        chipW: chip.offsetWidth,
      };
    });
    for (const gap of gaps) expect(gap, `rested=${rested}`).toBeGreaterThanOrEqual(chipW * 0.4);
  }
});
