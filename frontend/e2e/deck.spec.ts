import type { Locator } from "@playwright/test";
import { expect, formatIssues, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

async function expectStill(row: Locator, still: number, need: number) {
  const num = row.locator(".still-need-num");
  if (await num.count()) {
    await expect(num).toHaveText(String(still));
    await expect(row.locator(".still-need-of")).toHaveText(`of ${need}`);
  } else {
    await expect(row).toContainText(`To buy ${still} of ${need}`);
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
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toHaveCount(0);

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
  await expect(page.locator(".deck-toolbar")).toMatchAriaSnapshot(`
    - searchbox "Search cards"
    - button /^Sort/
    - button /Filters/
    - group "Card layout":
      - button "List" [pressed]
      - button "Grid"
    - group "List density":
      - button "Comfortable" [pressed]
      - button "Compact"
  `);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("each card row names the card, how many are still needed and its price", async ({ page }) => {
  await expect(page.locator(IZO)).toContainText("EB01-002");
  await expect(page.locator(IZO)).toContainText("Izo");
  await expectStill(page.locator(IZO), 2, 4);
  await expect(page.locator(IZO).locator("button:not(.alt-arts button)").filter({ hasText: /\$1\.25/ })).toBeVisible();
  await expect(page.locator(IZO).locator("input.owned")).toHaveValue("2");
  await expect(page.locator(IZO).locator(".owned-total")).toHaveCount(0);
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
  await expect(panel.getByRole("listitem").first()).toContainText("Jan 10");
  await expect(panel).toBeInViewport({ ratio: 1 });
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
  await expect(page.getByLabel("To buy only")).toBeChecked();
  await page.keyboard.press("Escape");

  const sort = page.getByRole("button", { name: /^Sort:/ });
  await expectStationary(sort, () => sort.click(), "Sort menu");
  const sortPanel = page.getByRole("dialog", { name: "Sort order" });
  await expect(sortPanel).toBeVisible();
  let issues = await planner.audit();
  expect(issues, `sort menu open:\n${formatIssues(issues)}`).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sortPanel).toHaveCount(0);

  await filters.click();
  await page.getByLabel("To buy only").uncheck();
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toBeVisible();
  issues = await planner.audit();
  expect(issues, `filters open:\n${formatIssues(issues)}`).toEqual([]);
});

test("owned stepper saves each click and updates still needed (#652)", async ({ page, planner }) => {
  const row = page.locator(IZO);
  const total = row.locator("input.owned");
  await expect(total).toHaveValue("2");

  const inc = row.getByRole("button", { name: "Increase owned", exact: true });
  const dec = row.getByRole("button", { name: "Decrease owned", exact: true });
  await inc.click();
  await expect(total).toHaveValue("3");
  await expectStill(row, 1, 4);
  expect(planner.owned.get("EB01-002")).toBe(3);
  expect(planner.requests).toContain("PUT /owned/EB01-002");

  await dec.click();
  await dec.click();
  await expect(total).toHaveValue("1");
  await expectStill(row, 3, 4);
  expect(planner.owned.get("EB01-002")).toBe(1);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Show alt arts").uncheck();
  const owned = row.getByRole("textbox");
  await expect(owned).toHaveValue("1");
  await owned.fill("4");
  await owned.blur();
  await expect(row).toHaveCount(0); // fully owned: drops out of "To buy only"
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

async function openStats(page: import("@playwright/test").Page) {
  if (page.viewportSize()!.width >= 1000) return;
  await page.getByRole("button", { name: /^Deck stats/ }).click();
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
  const left = page.locator(".deck-progress-meta");
  await expect(left).toHaveText("$36.80 to finish");

  const inc = page.locator(IZO).getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true });
  const qty = page.locator(IZO).locator(".alt-art:not(.alt-art-base) .alt-want-qty");
  await expect(page.locator(IZO).locator(".alt-want-caption")).toHaveText(["Owned", "Owned"]);
  await expect(page.locator(IZO).locator(".alt-art-base")).toContainText("Base");

  await inc.click();
  await expect(qty).toHaveText("1");
  await expect(left).toHaveText("$35.55 to finish");
  expect(planner.altOwned.get("EB01-002:201")).toBe(1);
  await expect(page.locator(IZO).locator(".owned-total")).toHaveText("3");
  await expect(page.locator(IZO).locator(".alts-owned-note")).toHaveText("2 base · 1 alt");
  await expectStill(page.locator(IZO), 1, 4);
  await expect(page.locator(IZO).locator(".alt-art-base")).toContainText("Base");
  await expect(page.locator(IZO).locator("img.thumb").first()).toHaveAttribute("src", /201_400w/);
  await inc.click();
  await expect(left).toHaveText("$34.30 to finish");
  await expect(page.locator(IZO)).toHaveCount(0);
});

test("Show picks the card's art, an unowned alt or the base over an owned alt, without changing counts (#702)", async ({ page, planner }) => {
  const left = page.locator(".deck-progress-meta");
  await expect(left).toHaveText("$36.80 to finish");
  const mainArt = page.locator(IZO).locator("img.thumb").first();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);

  await page.locator(IZO).getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /201_400w/);
  await expect(page.locator(IZO).locator(".alt-art:not(.alt-art-base) .alt-shown-chip")).toHaveText("Shown");
  expect(planner.displayArt.get("EB01-002")).toBe(201);
  expect(planner.altOwned.get("EB01-002:201")).toBeUndefined();
  await expect(left).toHaveText("$36.80 to finish");

  await page.locator(IZO).getByRole("button", { name: "Increase owned for Izo (Alternate Art)", exact: true }).click();
  await expect(left).toHaveText("$35.55 to finish");
  await page.locator(IZO).getByRole("button", { name: "Show Izo base art as the card's art" }).click();
  await expect(mainArt).toHaveAttribute("src", /101_400w/);
  expect(planner.displayArt.get("EB01-002")).toBe(0);
  await page.reload();
  await expect(page.locator(IZO).locator("img.thumb").first()).toHaveAttribute("src", /101_400w/);
});

test("alt arts sit in the list's own last column and the table still fits beside the dock and the editor (#877)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the table layout is desktop only");
  const check = async (label: string) => {
    const table = page.locator(".desktop-table table");
    await expect(table.locator("thead th").last()).toHaveText("Alt arts");
    const g = await table.evaluate((t) => {
      const wrap = t.parentElement!;
      const rowOf = (id: string) => t.querySelector(`[data-card-id="${id}"]`)!;
      const geometry = (id: string) => {
        const row = rowOf(id);
        const last = row.lastElementChild as HTMLElement;
        return {
          lastIsAlt: last.classList.contains("alt-arts-cell"),
          tilesInAltCell: last.querySelectorAll(".alt-art").length,
          tilesInCardCell: row.querySelector(".card-cell")!.querySelectorAll(".alt-art").length,
          altLeft: last.getBoundingClientRect().left,
          cardRight: row.querySelector(".card-cell")!.getBoundingClientRect().right,
        };
      };
      return { fits: wrap.scrollWidth <= wrap.clientWidth, izo: geometry("EB01-002"), kid: geometry("EB01-003") };
    });
    expect(g.fits, `${label}: the table scrolls sideways`).toBe(true);
    expect(g.izo.lastIsAlt).toBe(true);
    expect(g.izo.tilesInAltCell).toBeGreaterThan(0);
    expect(g.izo.tilesInCardCell).toBe(0);
    expect(g.izo.altLeft).toBeGreaterThanOrEqual(g.izo.cardRight);
    expect(g.kid.lastIsAlt).toBe(true);
    expect(g.kid.tilesInAltCell).toBe(0);
    expect(g.kid.altLeft).toBe(g.izo.altLeft);
    const issues = await planner.audit();
    expect(issues, `${label}:\n${formatIssues(issues)}`).toEqual([]);
  };
  await check("viewing");
  await page.getByRole("button", { name: "Edit deck" }).click();
  await expect(page.locator(".deck-layout-editing")).toBeVisible();
  await check("editing");
});
