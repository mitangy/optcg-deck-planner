/**
 * Card action popover and Attach DON!! confirm stay fully on screen (#449).
 * Both used to go above the card whenever it was more than ~80 px from the top
 * of the window, ignoring their own height: a Leader scrolled or squeezed near
 * the top got a popover whose +1 / +2 row ran off the screen.
 *
 * `?cantattack&dons` is your main phase with DON!! to give: the Leader's popover
 * holds a +1 / +2 row and an Attack button.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const LEADER = '.side-you [data-instance-id="y-leader"]';

async function openDemo(page: Page, params = "cantattack&dons") {
  await page.goto(`/demo?${params}`);
  await page.locator(".board-root").waitFor();
  await expect(page.locator(LEADER)).toBeVisible();
}

/** Slide the Leader's cell so the card's top edge sits `top` px from the top of the window. */
async function moveLeaderTo(page: Page, top: number) {
  await page.evaluate(
    ({ sel, top }) => {
      const tile = document.querySelector<HTMLElement>(sel)!;
      const cell = tile.parentElement!;
      cell.style.transform = "";
      const dy = top - tile.getBoundingClientRect().top;
      cell.style.transform = `translateY(${dy}px)`;
    },
    { sel: LEADER, top },
  );
}

/** Every button of the overlay is inside the window and is what a tap at its centre reaches. */
async function expectButtonsReachable(page: Page, overlay: string, note = "") {
  const report = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return [...root.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        name: (b.textContent?.trim() ?? "") + ` [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh}]`,
        inside: r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw,
        reachable: hit === b || b.contains(hit),
      };
    });
  }, overlay);
  expect(report, `${overlay} is open`).not.toBeNull();
  expect(report!.length).toBeGreaterThan(0);
  for (const b of report!) {
    expect(b.inside, `${note} ${b.name} is inside the window`).toBe(true);
    expect(b.reachable, `${b.name} is not covered`).toBe(true);
  }
}

test("a Leader near the top of the window gets its +1 / +2 popover on screen and +1 attaches (#449)", async ({ page }) => {
  await openDemo(page);
  await moveLeaderTo(page, 90);
  await page.locator(LEADER).dispatchEvent("click");
  await expect(page.locator(".card-actions")).toBeVisible();
  await expectButtonsReachable(page, ".card-actions");

  await page.getByRole("button", { name: /^Give 1 DON!!/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "give_don", donId: "d1", targetId: "y-leader" }]);
});

test("the popover stays on screen wherever the card sits, above, below or squeezed (#449)", async ({ page }) => {
  await openDemo(page);
  const vh = page.viewportSize()!.height;
  // Near the top, mid-window and near the bottom edge.
  for (const top of [20, 90, Math.round(vh / 2), vh - 80]) {
    await moveLeaderTo(page, top);
    await page.locator(LEADER).dispatchEvent("click");
    await expect(page.locator(".card-actions"), `top ${top}`).toBeVisible();
    await expectButtonsReachable(page, ".card-actions", `card top ${top}:`);
    await page.locator(LEADER).dispatchEvent("click");
    await expect(page.locator(".card-actions")).toHaveCount(0);
  }
});

test("the Attach DON!! confirm stays on screen for a Leader near the top (#449)", async ({ page }) => {
  await openDemo(page);
  await moveLeaderTo(page, 90);
  // Select a DON!! in the cost area, then tap the Leader: "Attach DON!!" asks to confirm.
  await page.locator('.don-strip-you .don-chip-btn[data-don-id="d1"]').click({ force: true });
  await page.locator(LEADER).dispatchEvent("click");
  await expect(page.locator(".don-attach-confirm")).toBeVisible();
  await expectButtonsReachable(page, ".don-attach-confirm");
  // The whole confirm, title row included, not just its buttons.
  expect((await page.locator(".don-attach-confirm").boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.locator(".don-attach-ok").click();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "give_don", donId: "d1", targetId: "y-leader" }]);
});

// The confirm's button passed its click event on as the pending attach, which threw and sent nothing.
test("tapping Attach DON!! on the confirm sends the give_don and closes it (#449)", async ({ page }) => {
  await openDemo(page);
  await page.locator('.don-strip-you .don-chip-btn[data-don-id="d1"]').click({ force: true });
  await page.locator(LEADER).click();
  await page.getByRole("button", { name: "Attach 1 DON!!" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "give_don", donId: "d1", targetId: "y-leader" }]);
  await expect(page.locator(".don-attach-confirm")).toHaveCount(0);
});

// The confirm had a fixed 250px width while the font grew with the window and Text size, so the OK label spilled out.
test("the Attach DON!! button fits its label on a big screen with Extra large text (#493)", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "optcg-duel:settings";
    let cur: Record<string, unknown> = {};
    try {
      cur = JSON.parse(localStorage.getItem(key) ?? "{}") ?? {};
    } catch {
      cur = {};
    }
    localStorage.setItem(key, JSON.stringify({ ...cur, textSize: "xlarge" }));
  });
  for (const [w, h] of [
    [2560, 1440],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await openDemo(page);
    await page.locator('.don-strip-you .don-chip-btn[data-don-id="d1"]').click({ force: true });
    await page.locator('.side-you [data-instance-id="y-c1"]').dispatchEvent("click");
    await expect(page.locator(".don-attach-confirm")).toBeVisible();
    const report = await page.evaluate(() => {
      const box = document.querySelector(".don-attach-confirm")!.getBoundingClientRect();
      const fit = (sel: string) => {
        const b = document.querySelector<HTMLElement>(sel)!;
        const r = b.getBoundingClientRect();
        return {
          sel,
          overflow: b.scrollWidth - b.clientWidth,
          inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5,
        };
      };
      return {
        buttons: [fit(".don-attach-ok"), fit(".don-attach-cancel")],
        onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      };
    });
    for (const b of report.buttons) {
      expect(b.overflow, `${w}x${h} ${b.sel} label overflow`).toBeLessThanOrEqual(1);
      expect(b.inside, `${w}x${h} ${b.sel} inside the confirm`).toBe(true);
    }
    expect(report.onScreen, `${w}x${h} confirm on screen`).toBe(true);
  }
});
