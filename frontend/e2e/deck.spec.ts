/**
 * The deck page: open it, toggle List/Grid, expand a market price, open the
 * filters and the sort menu, edit owned counts. Every flow ends with the UI
 * audit, and every toggle checks its trigger does not move (CLAUDE.md UI-polish
 * rules 1 and 6). Runs at desktop-1200 and phone-375.
 */
import type { Locator } from "@playwright/test";
import { expect, formatIssues, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

/** Still needed: the table shows "2" over "of 4"; the phone list says "Still need 2 of 4". */
async function expectStill(row: Locator, still: number, need: number) {
  const num = row.locator(".still-need-num");
  if (await num.count()) {
    await expect(num).toHaveText(String(still));
    await expect(row.locator(".still-need-of")).toHaveText(`of ${need}`);
  } else {
    await expect(row).toContainText(`Still need ${still} of ${need}`);
  }
}

const IZO = '[data-card-id="EB01-002"]:visible';

test.beforeEach(async ({ planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("opens the deck and passes the UI audit", async ({ page, planner }) => {
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  await expect(page.locator(IZO)).toBeVisible();
  // The default "Still need only" filter hides the fully owned Chopper.
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toHaveCount(0);

  // Header region: title, Main badge, size counters, leader line, actions.
  await expect(page.locator(".deck-detail-head")).toMatchAriaSnapshot(`
    - img "Kouzuki Oden"
    - paragraph:
      - link "← Decks"
    - heading "Oden Red/Green" [level=1]
    - text: /Main deck/
    - paragraph: Leader EB01-001 · Kouzuki Oden · Main deck for this leader
  `);
  await expect(page.locator(".deck-head-actions")).toMatchAriaSnapshot(`
    - button "Edit deck"
    - button "Share"
    - button "More"
  `);
  // Toolbar region: search, layout toggle, collapsed filters.
  await expect(page.locator(".deck-toolbar")).toMatchAriaSnapshot(`
    - searchbox "Search cards"
    - group "Card layout":
      - button "List" [pressed]
      - button "Grid"
    - button /Filters/
  `);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("each card row names the card, how many are still needed and its price", async ({ page }) => {
  await expect(page.locator(IZO)).toContainText("EB01-002");
  await expect(page.locator(IZO)).toContainText("Izo");
  await expectStill(page.locator(IZO), 2, 4);
  await expect(page.locator(IZO).locator("button:not(.alt-arts button)").filter({ hasText: /\$1\.25/ })).toBeVisible();
  // Izo has alt arts on screen, so its Owned cell is the read-only total.
  await expect(page.locator(IZO).locator(".owned-total-num")).toHaveText("2");
  await expect(page.locator(IZO).getByRole("textbox")).toHaveCount(0);
});

test("List/Grid toggle swaps the layout and passes the audit", async ({ page, planner }) => {
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  const list = page.getByRole("button", { name: "List", exact: true });
  await expect(page.locator(".card-grid")).toHaveCount(0);

  await expectStationary(grid, () => grid.click(), "Grid toggle");
  await expect(page.locator(".card-grid")).toBeVisible();
  await expect(page.locator(".grid-card:visible")).toHaveCount(4);
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  let issues = await planner.audit();
  expect(issues, `grid:\n${formatIssues(issues)}`).toEqual([]);

  await expectStationary(list, () => list.click(), "List toggle");
  await expect(page.locator(".card-grid")).toHaveCount(0);
  await expect(list).toHaveAttribute("aria-pressed", "true");
  issues = await planner.audit();
  expect(issues, `list:\n${formatIssues(issues)}`).toEqual([]);
});

test("expanding a market price shows the last sales without moving the price", async ({ page, planner }) => {
  const price = page.locator(IZO).locator("button:not(.alt-arts button)").filter({ hasText: /\$1\.25/ });
  await expectStationary(price, () => price.click(), "market price");
  await expect(price).toHaveAttribute("aria-expanded", "true");

  const panel = page.getByRole("region", { name: "Last 3 sold prices" });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByRole("listitem").first()).toContainText("$1.30");
  // Dates come from the fixed clock, not today's date.
  await expect(panel.getByRole("listitem").first()).toContainText("Jan 10");
  await expect(panel).toBeInViewport({ ratio: 1 });
  // The audit scrolls the whole page and the open panel follows its price off
  // the top edge; its on-screen fit is the toBeInViewport check above.
  const issues = await planner.audit({ offscreenOk: [".market-sales"] });
  expect(issues, formatIssues(issues)).toEqual([]);

  await expectStationary(price, () => page.keyboard.press("Escape"), "market price close");
  await expect(panel).toHaveCount(0);
});

test("opening the filters and the sort menu moves nothing", async ({ page, planner }) => {
  const filters = page.getByRole("button", { name: /^Filters/ });
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await expectStationary(filters, () => filters.click(), "Filters toggle");
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Still need only")).toBeChecked();

  // The control row under the drawer shifts down (the toolbar grows); the sort trigger itself must hold still once open.
  const sort = page.getByRole("button", { name: /^Sort:/ });
  await expectStationary(sort, () => sort.click(), "Sort menu");
  const sortPanel = page.getByRole("dialog", { name: "Sort order" });
  await expect(sortPanel).toBeVisible();
  let issues = await planner.audit();
  expect(issues, `sort menu open:\n${formatIssues(issues)}`).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sortPanel).toHaveCount(0);

  // Unticking "Still need only" brings back the fully owned card.
  await page.getByLabel("Still need only").uncheck();
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toBeVisible();
  issues = await planner.audit();
  expect(issues, `filters open:\n${formatIssues(issues)}`).toEqual([]);
});

test("owned stepper saves each click and updates still needed (#652)", async ({ page, planner }) => {
  const row = page.locator(IZO);
  const total = row.locator(".owned-total-num");
  await expect(total).toHaveText("2");

  // With alt tiles on screen the base count is edited under the Base tile.
  const inc = row.getByRole("button", { name: "Increase owned for Izo base art", exact: true });
  const dec = row.getByRole("button", { name: "Decrease owned for Izo base art", exact: true });
  await inc.click();
  await expect(total).toHaveText("3");
  await expectStill(row, 1, 4);
  expect(planner.owned.get("EB01-002")).toBe(3);
  expect(planner.requests).toContain("PUT /owned/EB01-002");

  await dec.click();
  await dec.click();
  await expect(total).toHaveText("1");
  await expectStill(row, 3, 4);
  expect(planner.owned.get("EB01-002")).toBe(1);

  // Hide alt arts: the Owned cell is the typeable stepper again, and typing a number saves it too.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Show alt arts").uncheck();
  const owned = row.getByRole("textbox");
  await expect(owned).toHaveValue("1");
  await owned.fill("4");
  await owned.blur();
  await expect(row).toHaveCount(0); // fully owned: drops out of "Still need only"
  expect(planner.owned.get("EB01-002")).toBe(4);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("cannot take owned below zero", async ({ page, planner }) => {
  const kid = page.locator('[data-card-id="EB01-003"]:visible');
  await expect(kid.getByRole("textbox")).toHaveValue("0");
  await expect(kid.getByRole("button", { name: "Decrease owned", exact: true })).toBeDisabled();
  expect(planner.requests.filter((r) => r.startsWith("PUT /owned"))).toEqual([]);
});

test("edit mode opens the card editor and in-deck steppers without breaking layout", async ({ page, planner }) => {
  // The label flips to "Done editing", so find the toggle by its class rather than its name.
  const edit = page.locator(".deck-edit-toggle");
  await expect(edit).toHaveText("Edit deck");
  await expectStationary(edit, () => edit.click(), "Edit deck");
  await expect(page.getByRole("button", { name: /^Done/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Increase EB01-002 in deck" }).first()).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("DON!! browser shows big card tiles and searches the DON!! catalog (#435)", async ({ page, planner }) => {
  await page.getByRole("button", { name: /Available DON!! cards/ }).click();
  const tiles = page.locator(".don-tile");
  await expect(tiles).toHaveCount(3);
  for (const img of await page.locator(".don-tile .thumb").all()) {
    expect((await img.boundingBox())!.width).toBeGreaterThanOrEqual(120);
  }
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noOverflow()).toBe(true);

  const sent = page.waitForRequest((r) => r.url().includes("/catalog/cards") && r.url().includes("card_type=DON") && r.url().includes("q=zoro"));
  await page.getByRole("searchbox", { name: "Search DON!! cards" }).fill("zoro");
  await sent;
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("DON-002");

  await page.getByRole("searchbox", { name: "Search DON!! cards" }).fill("nothing-like-this");
  await expect(page.getByText("No DON!! cards match “nothing-like-this”.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search DON!! cards" }).fill("zoro");
  await expect(tiles).toHaveCount(1);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

/** Opens the deck's stats where they live: the sticky dock at 1200, the sheet behind the Stats pill on a phone. */
async function openStats(page: import("@playwright/test").Page) {
  if (page.viewportSize()!.width >= 1000) return;
  await page.getByRole("button", { name: /^Stats/ }).click();
}

test("Why? on a build hint opens Log Pose and sends the hint with the deck (#399)", async ({ page, planner }) => {
  planner.enableLogPose();
  await planner.open(`/decks/${DECK_ID}`);
  await openStats(page);

  await page.locator('[data-hint-id="count"]:visible').click();
  const pop = page.locator(".dh-pop");
  const why = pop.getByRole("button", { name: "Why? Ask Log Pose" });
  const dismiss = pop.getByRole("button", { name: "Dismiss" });
  const [whyBox, dismissBox] = [await why.boundingBox(), await dismiss.boundingBox()];
  expect(whyBox!.height).toBe(dismissBox!.height);
  expect(whyBox!.height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 500 ? 44 : 32);
  expect(whyBox!.y).toBe(dismissBox!.y);
  await why.click();

  await expect(page.getByRole("dialog", { name: "Log Pose" })).toBeVisible();
  await expect(page.getByText("Because the deck has 15 cards.")).toBeVisible();
  await expect(pop).toHaveCount(0);
  expect(planner.chats).toHaveLength(1);
  const chat = planner.chats[0]!;
  expect(chat.message).toContain("14 of 50 cards");
  expect(chat.context?.hint?.id).toBe("count");
  expect(chat.context?.deck?.leaderId).toBe("EB01-001");
  expect(chat.context?.deck?.plannerDeckId).toBe(DECK_ID);
});

test("no Why? on a hint while Log Pose is off (#399)", async ({ page }) => {
  await openStats(page);
  await page.locator('[data-hint-id="count"]:visible').click();
  await expect(page.locator(".dh-pop").getByRole("button", { name: "Dismiss" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ask Log Pose/ })).toHaveCount(0);
});

test("an owned alt art lowers $ left, becomes the main art, and leaves a Base tile (#625)", async ({ page, planner }) => {
  // Still needed: Izo 2 x $1.25, Kid & Killer 4 x $6.80, EB01-009 2 x $3.50, EB01-011 1 x $0.10 = $36.80.
  const left = page.locator(".deck-progress-meta");
  await expect(left).toHaveText("$36.80 left");

  // Alt arts are shown by default.
  const inc = page.locator(IZO).getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true });
  const qty = page.locator(IZO).locator(".alt-art:not(.alt-art-base) .alt-want-qty");
  // The Base tile and the alt tile each have an Owned stepper.
  await expect(page.locator(IZO).locator(".alt-want-caption")).toHaveText(["Owned", "Owned"]);
  await expect(page.locator(IZO).locator(".alt-art-base")).toContainText("Base");

  // One owned alt copy covers one Izo: 36.80 - 1.25.
  await inc.click();
  await expect(qty).toHaveText("1");
  await expect(left).toHaveText("$35.55 left");
  expect(planner.altOwned.get("EB01-002:201")).toBe(1);
  // Owned is the total (2 base + 1 alt) and Still needed is what is left of 4.
  await expect(page.locator(IZO).locator(".owned-total-num")).toHaveText("3");
  await expect(page.locator(IZO).locator(".owned-total-split")).toHaveText("2 base + 1 alt");
  await expectStill(page.locator(IZO), 1, 4);
  // The alt is now the main image and the base art sits in a Base tile.
  await expect(page.locator(IZO).locator(".alt-art-base")).toContainText("Base");
  await expect(page.locator(IZO).locator("img.thumb").first()).toHaveAttribute("src", /201_400w/);
  // Both still-needed copies covered: 36.80 - 2.50, and Izo leaves the "still need" list.
  await inc.click();
  await expect(left).toHaveText("$34.30 left");
  await expect(page.locator(IZO)).toHaveCount(0);
});

test("Show picks the card's art, an unowned alt or the base over an owned alt, without changing counts (#702)", async ({ page, planner }) => {
  const left = page.locator(".deck-progress-meta");
  await expect(left).toHaveText("$36.80 left");
  const mainArt = page.locator(IZO).locator("img.thumb").first();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);

  // Show the alt nobody owns: it becomes the card's picture and the counts stay put.
  await page.locator(IZO).getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /201_400w/);
  await expect(page.locator(IZO).locator(".alt-art:not(.alt-art-base) .alt-shown-chip")).toHaveText("Shown");
  expect(planner.displayArt.get("EB01-002")).toBe(201);
  expect(planner.altOwned.get("EB01-002:201")).toBeUndefined();
  await expect(left).toHaveText("$36.80 left");

  // Own a copy of the alt, then choose the base art anyway: the base stays the picture.
  await page.locator(IZO).getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await expect(left).toHaveText("$35.55 left");
  await page.locator(IZO).getByRole("button", { name: "Show Izo base art as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);
  expect(planner.displayArt.get("EB01-002")).toBe(0);
  // The choice is saved: a reload keeps the base art.
  await page.reload();
  await expect(page.locator(IZO).locator("img.thumb").first()).toHaveAttribute("src", /101_400w/);
});

test("alt arts sit beside the card on wide screens and under it below 1440px (#734)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the table layout is desktop only");
  const geometry = () =>
    page.evaluate(() => {
      const row = document.querySelector('.desktop-table [data-card-id="EB01-002"]')!;
      const art = row.querySelector(".card-cell-inner .thumb")!.getBoundingClientRect();
      const text = row.querySelector(".card-cell-inner > div:not(.thumb):not(.thumb-btn)")!.getBoundingClientRect();
      const tile = row.querySelector(".card-cell-alts .alt-art")!.getBoundingClientRect();
      return { art: { top: art.top, bottom: art.bottom }, textRight: text.right, tile: { top: tile.top, bottom: tile.bottom, left: tile.left } };
    });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(IZO).locator(".card-cell-alts .alt-art").first()).toBeVisible();
  const wide = await geometry();
  // Same row: the tile overlaps the art's vertical span (it can be taller than the art, with its Owned stepper).
  expect(wide.tile.top).toBeLessThan(wide.art.bottom);
  expect(wide.tile.bottom).toBeGreaterThan(wide.art.top);
  expect(wide.tile.left).toBeGreaterThanOrEqual(wide.textRight);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.setViewportSize({ width: 1200, height: 900 });
  const narrow = await geometry();
  expect(narrow.tile.top).toBeGreaterThanOrEqual(narrow.art.bottom);
});
