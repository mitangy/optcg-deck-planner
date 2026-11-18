import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

// Top of the first card in whichever layout is showing (table row, or phone card).
const listTop = (page: Page) =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll<HTMLElement>("tbody tr, .mobile-card")].find((e) => e.offsetParent);
    return row ? Math.round(row.getBoundingClientRect().top + window.scrollY) : -1;
  });

async function stableTop(page: Page): Promise<number> {
  let last = -2;
  await expect
    .poll(async () => {
      const now = await listTop(page);
      const same = now === last && now > 0;
      last = now;
      return same;
    })
    .toBe(true);
  return last;
}

test("opening Add cards does not move the list (#1342)", async ({ page, planner }) => {
  await planner.open("/");
  const before = await stableTop(page);
  await page.getByRole("button", { name: "Add cards" }).click();
  await expect(page.locator(".shopping-add").getByRole("searchbox")).toBeVisible();
  await page.locator(".shopping-add").getByRole("searchbox").fill("Izo");
  await expect(page.locator('[data-catalog-id="EB01-002"]')).toBeVisible();
  expect(await listTop(page)).toBe(before);
});

test("the list starts higher: totals share the title row and Add cards is a button (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "the phone keeps its stacked head");
  planner.defaultDensity = true;
  await planner.open("/");
  await page.setViewportSize({ width: 1280, height: 720 });
  // Was 495 with the Add cards bar and the stats row above the search; one toolbar and a Compact list brought it to about 320.
  expect(await stableTop(page)).toBeLessThanOrEqual(320);
});

test("on a phone the first card starts above 400px with nothing selected (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "phone head");
  planner.defaultDensity = true;
  await planner.open("/");
  expect(await stableTop(page)).toBeLessThanOrEqual(400);
});

test("ticking a card shows the selection bar over the page and moves nothing (#1342)", async ({ page, planner }, info) => {
  await planner.open("/");
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/select/i.test(k)) localStorage.removeItem(k);
  });
  await planner.open("/");
  const before = await stableTop(page);
  const phone = info.project.name === "phone-375";
  if (phone) await page.locator(".mobile-card").first().click({ position: { x: 200, y: 8 } });
  else await page.getByRole("checkbox", { name: /^Select EB01-/ }).first().check();
  const dock = page.getByTestId("buy-dock");
  await expect(dock).toBeVisible();
  expect(await stableTop(page)).toBe(before);
  const box = (await dock.locator(".buy-dock-bar").boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.y + box.height).toBeGreaterThan(vh - 40);
  await expect(page.getByRole("button", { name: /^Buy 1 selected$/ })).toBeVisible();
});

test("Buy menu scope: every card still to buy when nothing is ticked, else only the ticked ones (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "same handler on the phone");
  await planner.open("/");
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/select/i.test(k)) localStorage.removeItem(k);
  });
  await planner.open("/");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = async () => {
    await page.getByRole("button", { name: "More ways to buy" }).first().click();
    await page.getByRole("menuitem", { name: /Copy for TCGPlayer/ }).click();
  };
  await copy();
  await expect(page.getByRole("status").filter({ hasText: /Copied/ })).toContainText("Copied 4 cards (9 copies)");
  await page.getByRole("checkbox", { name: /^Select EB01-/ }).first().check();
  await copy();
  await expect(page.getByRole("status").filter({ hasText: /Copied/ })).toContainText("Copied 1 card (2 copies)");
});
