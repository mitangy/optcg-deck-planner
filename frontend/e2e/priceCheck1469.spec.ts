import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Price check finds a card by set code, lists its alt art as its own row and shows the last sales of a tapped price (#1469)", async ({ page, planner }) => {
  planner.catalogAltRows = true;
  await planner.open("/");
  await page.getByRole("button", { name: /^Price check/ }).click();
  const dialog = page.getByRole("dialog", { name: "Price check" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("searchbox", { name: "Search card prices" });
  await expect(search).toBeFocused();
  await expect(dialog.getByText("Search by name, set code (like OP14-033), effect or type")).toBeVisible();

  await search.fill("EB01-002");
  const rows = dialog.locator(".price-check-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("EB01-002");
  await expect(rows.nth(0).locator(".alt-art-chip")).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("Izo (Alternate Art)");
  await expect(rows.nth(1).locator(".alt-art-chip")).toBeVisible();
  await expect(rows.nth(1).locator(".market-price-btn")).toContainText("$14.99");
  await expect(rows.nth(1)).toContainText("Low $12.50");

  await rows.nth(1).locator(".market-price-btn").click();
  const sales = page.getByRole("region", { name: "Last 3 sold prices" });
  await expect(sales).toContainText("Last 3 sold");
  await expect(sales.getByRole("listitem")).toHaveCount(3);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Price check works with an empty shopping list, fits the screen and keeps the page still while open (#1469)", async ({ page, planner }, testInfo) => {
  planner.noDecks();
  await planner.open("/");
  const trigger = page.getByRole("button", { name: /^Price check/ });
  await expect(trigger).toBeVisible();
  const before = await trigger.boundingBox();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Price check" });
  await dialog.getByRole("searchbox", { name: "Search card prices" }).fill("Izo");
  await expect(dialog.locator(".price-check-row").first()).toBeVisible();

  const geometry = await page.evaluate(() => ({
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector(".price-check-panel")!.getBoundingClientRect().toJSON(),
    rows: [...document.querySelectorAll(".price-check-row")].map((r) => ({ right: r.getBoundingClientRect().right, overflow: r.scrollWidth - r.clientWidth, height: r.getBoundingClientRect().height })),
    vw: window.innerWidth,
    vh: window.innerHeight,
  }));
  expect(geometry.docOverflow).toBe(0);
  for (const r of geometry.rows) {
    expect(r.overflow).toBeLessThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(geometry.vw);
    expect(r.height).toBeGreaterThanOrEqual(56);
  }
  if (testInfo.project.name === "phone-375") {
    expect(geometry.panel.width).toBe(geometry.vw);
    expect(geometry.panel.height).toBe(geometry.vh);
  } else {
    expect(geometry.panel.width).toBeLessThanOrEqual(600);
    expect(geometry.panel.height).toBeLessThanOrEqual(geometry.vh * 0.8 + 1);
  }

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await trigger.boundingBox()).toEqual(before);
});
