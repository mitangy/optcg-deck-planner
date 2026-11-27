import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;

test("Price check adds a searched alt art to the collection without moving the row (#1496)", async ({ page, planner }, testInfo) => {
  planner.catalogAltRows = true;
  await planner.open("/");
  await page.getByRole("button", { name: /^Price check/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Price check" });
  await dialog.getByRole("searchbox", { name: "Search card prices" }).fill("EB01-002");
  const rows = dialog.locator(".price-check-row");
  await expect(rows).toHaveCount(2);

  // Base Izo: 2 owned in the fixture, so a stepper; its alt art: none owned, so Add.
  await expect(rows.nth(0).locator(".price-check-owned .deck-editor-qty, .price-check-owned input")).toHaveCount(1);
  const add = rows.nth(1).getByRole("button", { name: /Add .* to collection/ });
  await expect(add).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-before.png` });

  const slotBefore = await rows.nth(1).locator(".price-check-owned").boundingBox();
  const priceBefore = await rows.nth(1).locator(".market-price-btn").boundingBox();
  await add.click();
  await expect(rows.nth(1).locator(".price-check-owned .deck-editor-qty")).toHaveText("1");
  const slotAfter = await rows.nth(1).locator(".price-check-owned").boundingBox();
  expect(slotAfter!.x).toBeCloseTo(slotBefore!.x, 0);
  expect(slotAfter!.y).toBeCloseTo(slotBefore!.y, 0);
  expect(await rows.nth(1).locator(".market-price-btn").boundingBox()).toEqual(priceBefore);

  const overflow = await page.evaluate(() => [...document.querySelectorAll(".price-check-row")].map((r) => r.scrollWidth - r.clientWidth));
  for (const o of overflow) expect(o).toBeLessThanOrEqual(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-after.png` });

  if (SHOTS && testInfo.project.name === "phone-375") {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phone-landscape-812.png` });
  }
});
