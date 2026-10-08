/**
 * The deck page: open it, toggle List/Grid, expand a market price, open the
 * filters and the sort menu, edit owned counts. Every flow ends with the UI
 * audit, and every toggle checks its trigger does not move (CLAUDE.md UI-polish
 * rules 1 and 6). Runs at desktop-1200 and phone-375.
 */
import { expect, formatIssues, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

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
  await expect(page.locator(IZO)).toContainText("2/4");
  await expect(page.locator(IZO).getByRole("button", { name: /\$1\.25/ })).toBeVisible();
  await expect(page.locator(IZO).getByRole("textbox")).toHaveValue("2");
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
  const price = page.locator(IZO).getByRole("button", { name: /\$1\.25/ });
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
  await expect(page.getByRole("menu")).toBeVisible();
  let issues = await planner.audit();
  expect(issues, `sort menu open:\n${formatIssues(issues)}`).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Unticking "Still need only" brings back the fully owned card.
  await page.getByLabel("Still need only").uncheck();
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toBeVisible();
  issues = await planner.audit();
  expect(issues, `filters open:\n${formatIssues(issues)}`).toEqual([]);
});

test("owned stepper saves each click and updates still needed", async ({ page, planner }) => {
  const row = page.locator(IZO);
  const owned = row.getByRole("textbox");
  await expect(owned).toHaveValue("2");

  await row.getByRole("button", { name: "Increase owned" }).click();
  await expect(owned).toHaveValue("3");
  await expect(row).toContainText("1/4");
  expect(planner.owned.get("EB01-002")).toBe(3);
  expect(planner.requests).toContain("PUT /owned/EB01-002");

  await row.getByRole("button", { name: "Decrease owned" }).click();
  await row.getByRole("button", { name: "Decrease owned" }).click();
  await expect(owned).toHaveValue("1");
  await expect(row).toContainText("3/4");
  expect(planner.owned.get("EB01-002")).toBe(1);

  // Typing a number and leaving the box saves it too.
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
  await expect(kid.getByRole("button", { name: "Decrease owned" })).toBeDisabled();
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
