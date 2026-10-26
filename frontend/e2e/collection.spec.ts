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
  const green = page.getByRole("button", { name: "Green", exact: true });
  await expectStationary(green, () => green.click(), "Green colour chip");
  await expect(green).toHaveAttribute("aria-pressed", "true");
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

test("an alt tile shows its owned count, and stepping it raises Owned, the card's value and the totals (#723)", async ({ page, planner }) => {
  const izo = page.locator(row("EB01-002"));
  const totals = page.getByRole("list", { name: "Collection totals" });
  const altTile = izo.locator(".alt-art:not(.alt-art-base)");
  // Alt arts are on by default: a Base tile with its own Owned stepper plus Izo's one alt at 0.
  await expect(izo.locator(".alt-want-caption")).toHaveText(["Owned", "Owned"]);
  await expect(izo.locator(".alt-art-base")).toContainText("Base");
  await expect(altTile.locator(".alt-want-qty")).toHaveText("0");
  // Owned becomes the read-only total once the tiles carry the per-art counts.
  await expect(izo.locator(".owned-total-num")).toHaveText("2");
  await expect(totals).toContainText("$5.80");

  await izo.getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await expect(altTile.locator(".alt-want-qty")).toHaveText("1");
  expect(planner.altOwned.get("EB01-002:201")).toBe(1);
  await expect(izo.locator(".owned-total-num")).toHaveText("3");
  await expect(izo.locator(".owned-total-split")).toHaveText("2 base + 1 alt");
  // Izo: 2 x $1.25 + 1 x $14.99 = $17.49; the collection gains the alt's $14.99 and one copy.
  await expect(izo).toContainText("$17.49");
  await expect(totals).toContainText("$20.79");
  await expect(totals).toContainText("7");

  // The base count is edited under the Base tile and keeps the alt copies in the value.
  await izo.getByRole("button", { name: "Increase owned for Izo base art" }).click();
  await expect.poll(() => planner.owned.get("EB01-002")).toBe(3);
  await expect(izo.locator(".owned-total-split")).toHaveText("3 base + 1 alt");
  await expect(totals).toContainText("$22.04");

  // A reload shows what was saved.
  await page.reload();
  await expect(page.locator(row("EB01-002")).locator(".alt-art:not(.alt-art-base) .alt-want-qty")).toHaveText("1");
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$22.04");
});

test("Show makes an alt the card's picture without changing counts, and the base can be picked back (#723)", async ({ page, planner }) => {
  const izo = page.locator(row("EB01-002"));
  const mainArt = izo.locator("img.thumb").first();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);

  // Show the alt nobody owns: it becomes the picture; owned counts and the total stay put.
  await izo.getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /201_400w/);
  await expect(izo.locator(".alt-art:not(.alt-art-base) .alt-shown-chip")).toHaveText("Shown");
  expect(planner.displayArt.get("EB01-002")).toBe(201);
  expect(planner.altOwned.get("EB01-002:201")).toBeUndefined();
  await expect(izo.locator(".owned-total-num")).toHaveText("2");
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$5.80");

  // Own the alt, then choose the base art anyway: the base stays the picture.
  await izo.getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await izo.getByRole("button", { name: "Show Izo base art as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);
  expect(planner.displayArt.get("EB01-002")).toBe(0);

  // The choice is saved: after a reload the base art is still the picture.
  await page.reload();
  await expect(page.locator(row("EB01-002")).locator("img.thumb").first()).toHaveAttribute("src", /101_400w/);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a card with no alt arts keeps the Owned stepper, and turning Show alt arts off brings it back (#723)", async ({ page }) => {
  // Oden has no alts: the plain stepper, no tiles.
  const oden = page.locator(row("EB01-001"));
  await expect(oden.getByRole("textbox")).toHaveValue("1");
  await expect(oden.locator(".alt-art")).toHaveCount(0);
  const izo = page.locator(row("EB01-002"));
  await expect(izo.locator(".alt-art")).toHaveCount(2);
  await expect(izo.getByRole("textbox")).toHaveCount(0);

  const toggle = page.getByRole("button", { name: /Filters/ });
  await expectStationary(toggle, () => toggle.click(), "Filters button");
  await page.getByRole("checkbox", { name: "Show alt arts" }).uncheck();
  await expect(izo.locator(".alt-art")).toHaveCount(0);
  await expect(izo.getByRole("textbox")).toHaveValue("2");
  // The button counts filters that differ from their defaults; alt arts start on.
  await expect(toggle).toContainText("1 on");
});

test("the Grid layout shows the alt tiles, the Owned total and Show too (#723)", async ({ page, planner }) => {
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await expectStationary(grid, () => grid.click(), "Grid toggle");
  const izo = page.locator(".grid-card-wrap" + row("EB01-002"));
  await expect(izo.locator(".grid-card-alts .alt-art")).toHaveCount(2);
  await expect(izo.locator(".owned-total-num")).toHaveText("2");
  await expect(izo.locator("img.thumb").first()).toHaveAttribute("src", /101_400w/);

  await izo.getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await expect(izo.locator(".owned-total-num")).toHaveText("3");
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$20.79");
  // The owned alt takes over as the picture (no choice made), and Show can hand it back to the base.
  await expect(izo.locator("img.thumb").first()).toHaveAttribute("src", /201_400w/);
  await izo.getByRole("button", { name: "Show Izo base art as the card's art" }).click();
  await expect(izo.locator("img.thumb").first()).toHaveAttribute("src", /101_400w/);
  expect(planner.displayArt.get("EB01-002")).toBe(0);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("type and colour chips narrow the Collection together, and the count line keeps its place (#748)", async ({ page, planner }) => {
  const count = page.getByRole("status");
  const types = page.getByRole("group", { name: "Card type" });
  const colors = page.getByRole("group", { name: "Colors" });
  // Only the types owned get a chip: Oden is a Leader, Izo and Chopper are Characters.
  await expect(types.getByRole("button")).toHaveText(["All", "Leader", "Character"]);
  await expect(count).toHaveText("3 cards · 6 copies · $5.80");

  const before = await page.locator(row("EB01-002")).boundingBox();
  await types.getByRole("button", { name: "Character" }).click();
  await expect(types.getByRole("button", { name: "Character" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(2);
  await expect(page.locator(row("EB01-001"))).toHaveCount(0);
  await expect(count).toHaveText("Showing 2 of 3 cards · 5 copies · $3.40");
  // Same top edge once narrowed: the count line was already there, so nothing above the list moved.
  expect((await page.locator(row("EB01-002")).boundingBox())!.y).toBeCloseTo(before!.y, 0);

  // Every card is Red, so Red keeps both Characters; adding Green (any of) keeps them too.
  await colors.getByRole("button", { name: "Red", exact: true }).click();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(2);
  await colors.getByRole("button", { name: "Green", exact: true }).click();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(2);
  await types.getByRole("button", { name: "Leader" }).click();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(1);
  await expect(page.locator(row("EB01-001"))).toBeVisible();

  await colors.getByRole("button", { name: "Any color" }).click();
  await types.getByRole("button", { name: "All" }).click();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(3);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("the Grid tile shows the copies badge on the art, with name, id, price and colours (#748)", async ({ page, planner }) => {
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  const izo = page.locator(".grid-card-wrap" + row("EB01-002"));
  await expect(izo.locator(".copies-badge")).toHaveText("×2");
  await expect(izo.getByRole("img", { name: "2 owned" })).toBeVisible();
  await expect(izo.locator(".grid-card-name")).toHaveText("Izo");
  await expect(izo.locator(".color-chip")).toHaveText(["Red"]);
  await expect(izo).toContainText("EB01-002");
  // The badge sits on the art's top-right corner.
  const art = (await izo.locator("img.thumb").first().boundingBox())!;
  const badge = (await izo.locator(".copies-badge").boundingBox())!;
  expect(badge.x + badge.width).toBeGreaterThan(art.x + art.width - 4);
  expect(badge.y).toBeLessThan(art.y + 16);
  // Stepping an owned alt raises the badge with the card's total copies.
  await izo.getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await expect(izo.locator(".copies-badge")).toHaveText("×3");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
