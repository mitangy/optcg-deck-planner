/**
 * The Collection page (/collection): every owned card with its market value
 * and the collection total, plus search, filters and sorting. Runs at
 * desktop-1200 and phone-375 and ends each flow with the UI audit.
 */
import { expect, formatIssues, test } from "./fixtures";
import { expectStationary } from "./audit";

const row = (id: string) => `[data-card-id="${id}"]:visible`;

test.beforeEach(async ({ page, planner }) => {
  await planner.open("/collection");
  await expect(page.getByRole("heading", { name: "Collection", level: 1 })).toBeVisible();
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("lists owned cards by value with the collection total and passes the audit (#268)", async ({ page, planner }) => {
  const totals = page.getByRole("list", { name: "Collection totals" });
  // Oden 1 × $2.40 + Izo 2 × $1.25 + Chopper 3 × $0.30; unowned cards are left out.
  await expect(totals).toContainText("$5.80");
  await expect(totals).toContainText("6");
  await expect(page.locator(row("EB01-003"))).toHaveCount(0);
  // Value sort (the default) puts Izo's $2.50 ahead of Oden's $2.40 even though Oden's price is higher.
  const ids = await page.locator("[data-card-id]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("data-card-id")));
  expect(ids).toEqual(["EB01-002", "EB01-001", "EB01-006"]);
  await expect(page.locator(row("EB01-002"))).toContainText("$2.50");

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("stepping Owned updates the card value and the total (#268)", async ({ page, planner }) => {
  await page.locator(row("EB01-006")).getByRole("button", { name: "Increase owned" }).click();
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$6.10");
  await expect(page.locator(row("EB01-006"))).toContainText("$1.20");
  await expect.poll(() => planner.owned.get("EB01-006")).toBe(4);
});

test("color filter narrows the list and shows the filtered total (#268)", async ({ page, planner }) => {
  const toggle = page.getByRole("button", { name: /Filters/ });
  await expectStationary(toggle, () => toggle.click(), "Filters toggle");
  await page.getByRole("checkbox", { name: "Green" }).check();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(1);
  await expect(page.locator(row("EB01-001"))).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Showing 1 of 3 cards · 1 copy · $2.40");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("Add cards finds an unowned card and adds it to the collection (#268)", async ({ page, planner }) => {
  await page.getByRole("button", { name: /Add cards/ }).click();
  await page.locator(".collection-add").getByRole("searchbox").fill("Kid");
  const add = page.getByRole("button", { name: "Add EB01-003 to collection" });
  await add.click();
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(1);
  // Kid & Killer (1 × $6.80) joins the list and the total; the result row now shows its Owned stepper.
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$12.60");
  await expect(page.locator(row("EB01-003"))).toBeVisible();
  await expect(page.locator('[data-catalog-id="EB01-003"]').getByRole("textbox")).toHaveValue("1");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a scanned or looked-up card can be added from the scanner (#268)", async ({ page, planner }) => {
  await page.getByRole("button", { name: /Add cards/ }).click();
  await page.locator(".collection-add").getByRole("button", { name: "Scan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Scan cards" });
  await dialog.getByLabel("Or type the card number").fill("EB01-009");
  await dialog.getByRole("button", { name: "Look up" }).click();
  await dialog.getByRole("button", { name: "Add EB01-009 to collection" }).click();
  await expect.poll(() => planner.owned.get("EB01-009")).toBe(1);
  await expect(dialog.locator(".scan-hit-owned").getByRole("textbox")).toHaveValue("1");
  await dialog.getByRole("button", { name: "Close scanner" }).click();
  await expect(page.locator(row("EB01-009"))).toBeVisible();
});

test("Collection picks up copies a group buy's Mark purchased adds and Undo takes back (#268)", async ({ page, planner }) => {
  // Stay in the SPA (no reload) so the Collection list cached on open is what comes back.
  const nav = page.getByRole("navigation", { name: "Primary" });
  const totals = page.getByRole("list", { name: "Collection totals" });
  const toGroupBuy = async () => {
    await nav.getByRole("link", { name: "Group buys" }).click();
    await page.getByRole("link", { name: /Kid & Killer split/ }).click();
    await expect(page.getByRole("heading", { name: "Kid & Killer split", level: 1 })).toBeVisible();
  };
  const toCollection = async () => {
    await nav.getByRole("link", { name: "Collection" }).click();
    await expect(page.getByRole("heading", { name: "Collection", level: 1 })).toBeVisible();
  };
  page.on("dialog", (d) => void d.accept());
  await expect(totals).toContainText("$5.80");

  await toGroupBuy();
  await page.getByRole("button", { name: "Mark purchased (4)" }).click();
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(4);
  await expect(page.getByRole("button", { name: "Undo Mark purchased" })).toBeVisible();
  await toCollection();
  // Kid & Killer (4 × $6.80) is now owned, so it is listed and in the total, not offered as "Add".
  await expect(page.locator(row("EB01-003"))).toBeVisible();
  await expect(totals).toContainText("$33.00");

  await toGroupBuy();
  await page.getByRole("button", { name: "Undo Mark purchased" }).click();
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(0);
  await expect(page.getByRole("button", { name: "Mark purchased (4)" })).toBeVisible();
  await toCollection();
  await expect(page.locator(row("EB01-003"))).toHaveCount(0);
  await expect(totals).toContainText("$5.80");
});

test("Collection picks up a card marked Buying in person on the shopping list (#268)", async ({ page, planner }) => {
  // Stay in the SPA (no reload) so the Collection list cached on open is what comes back.
  const nav = page.getByRole("navigation", { name: "Primary" });
  const totals = page.getByRole("list", { name: "Collection totals" });
  await expect(totals).toContainText("$5.80");
  await nav.getByRole("link", { name: "Shopping" }).click();
  // A checkbox in the desktop table; the whole card is the toggle in the phone list (Space toggles either).
  const select = { name: "Select EB01-003", exact: true };
  await page.getByRole("checkbox", select).or(page.getByRole("button", select)).filter({ visible: true }).press("Space");
  await page.getByRole("button", { name: "Buying in person" }).click();
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(4);
  await nav.getByRole("link", { name: "Collection" }).click();
  await expect(page.locator(row("EB01-003"))).toBeVisible();
  await expect(totals).toContainText("$33.00");
});

test("clicking a table header sorts the Collection rows, again reverses, a third time restores the order (#636)", async ({ page, planner, isMobile }) => {
  test.skip(isMobile, "the header table is the desktop layout; phones use the Sort menu");
  const order = () =>
    page.locator("table.collection-table tbody tr[data-card-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-card-id")));
  const market = page.getByRole("button", { name: "Sort by Market" });
  const header = page.getByRole("columnheader", { name: /Market/ });

  // Value sort is the default order (Izo's two copies outrank Oden).
  await expect(header).toHaveAttribute("aria-sort", "none");
  expect(await order()).toEqual(["EB01-002", "EB01-001", "EB01-006"]);

  const before = await header.boundingBox();
  await market.click();
  // Market starts highest first: Oden $2.40, Izo $1.25, Chopper $0.30.
  await expect(header).toHaveAttribute("aria-sort", "descending");
  expect(await order()).toEqual(["EB01-001", "EB01-002", "EB01-006"]);
  expect(await header.boundingBox()).toEqual(before);
  // The arrow hangs outside the label, so it never widens the column (#636).
  const box = await market.evaluate((btn) => {
    const label = btn.querySelector(".th-sort-label")!.getBoundingClientRect();
    const arrow = btn.querySelector(".th-sort-arrow")!.getBoundingClientRect();
    return { button: btn.getBoundingClientRect().width, label: label.width, labelRight: label.right, arrowLeft: arrow.left };
  });
  expect(box.button).toBeCloseTo(box.label, 0);
  expect(box.arrowLeft).toBeGreaterThanOrEqual(box.labelRight);

  await market.click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  expect(await order()).toEqual(["EB01-006", "EB01-002", "EB01-001"]);

  await market.click();
  await expect(header).toHaveAttribute("aria-sort", "none");
  expect(await order()).toEqual(["EB01-002", "EB01-001", "EB01-006"]);

  // The choice is remembered across a reload.
  await market.click();
  await page.reload();
  await expect(page.getByRole("columnheader", { name: /Market/ })).toHaveAttribute("aria-sort", "descending");
  expect(await order()).toEqual(["EB01-001", "EB01-002", "EB01-006"]);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("scanning a photo of several cards adds them all to the collection (#701)", async ({ page, planner }) => {
  // Stand in for the detector: 5 crops, two of them the same card, one unmatched. The test releases it
  // after checking the progress line.
  await page.evaluate(() => {
    const thumb = (c: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="50" height="70"><rect width="50" height="70" fill="${c}"/></svg>`)}`;
    const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const item = (cardId: string | null, confidence: string, color: string) => ({ quad, thumbUrl: thumb(color), cardId, inliers: 40, runnerUp: 5, confidence });
    const w = window as unknown as Record<string, unknown>;
    w.__optcgTestMatchAll = async (_photo: unknown, _cands: unknown, onProgress?: (p: { index: number; total: number }) => void) => {
      onProgress?.({ index: 2, total: 5 });
      await new Promise<void>((resolve) => (w.__finishScan = resolve));
      return [item("EB01-003", "sure", "#c33"), item("EB01-003", "sure", "#c33"), item("EB01-009", "check", "#3a3"), item(null, "none", "#999"), item("EB01-011", "check", "#33c")];
    };
  });
  await page.getByRole("button", { name: /Add cards/ }).click();
  await page.locator(".collection-add").getByRole("button", { name: "Scan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Scan cards" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await dialog.locator('input[type="file"]').last().setInputFiles({ name: "binder.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByText("Identifying card 3 of 5…")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __finishScan: () => void }).__finishScan());

  await expect(dialog.getByRole("status")).toHaveText("5 cards found · 4 ready");
  const rows = dialog.locator(".scan-tray-row");
  await expect(rows).toHaveCount(4);
  // Two crops of Kid & Killer are one row of 2.
  await expect(rows.nth(0)).toContainText("Kid & Killer");
  await expect(rows.nth(0).getByRole("group")).toContainText("2");
  await expect(rows.nth(1)).toContainText("Check");
  await expect(rows.nth(2)).toContainText("No match");

  // The unmatched crop is skipped until fixed; typing its number includes it.
  await rows.nth(2).getByLabel("Card number").fill("EB01-006");
  await rows.nth(2).getByRole("button", { name: "Use" }).click();
  await expect(dialog.getByRole("status")).toHaveText("5 cards found · 5 ready");
  // Skip Mini-Merry.
  await dialog.getByRole("button", { name: "Fewer Mini-Merry" }).click();
  const add = dialog.getByRole("button", { name: "Add 4 cards to collection" });
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  const view = page.viewportSize()!;
  expect(box!.y + box!.height).toBeLessThanOrEqual(view.height);
  await add.click();

  await expect(dialog.getByRole("status").filter({ hasText: "Added" })).toHaveText("Added 4 cards");
  expect(planner.ownedAdds).toEqual([
    { items: [{ card_id: "EB01-003", add: 2 }, { card_id: "EB01-009", add: 1 }, { card_id: "EB01-006", add: 1 }] },
  ]);
  await dialog.getByRole("button", { name: "Done" }).click();
  // Kid & Killer 2 × $6.80 + Just Shut Up 1 × $3.50 + Chopper's extra copy join the $5.80 already owned.
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$23.20");
  await expect(page.locator(row("EB01-003"))).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
