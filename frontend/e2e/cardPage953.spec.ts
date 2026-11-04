/**
 * A page per card (#953): /cards/:id shows the art, the price history with When to buy for the chosen art (?art=),
 * and the card's tournament play. Public, so these run signed out. Runs at desktop-1200 and phone-375.
 */
import { expect, formatIssues, test } from "./fixtures";
import { LEADER, mockCardApi, ZORO } from "./cardPageFake";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("a signed-out visitor sees the card, picks an alt art and gets that art's price (#953)", async ({ page, planner }) => {
  planner.signOut();
  await mockCardApi(page);
  await planner.open(`/cards/${ZORO}`);

  await expect(page.getByRole("heading", { name: "Roronoa Zoro", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Roronoa Zoro (OP01-025) · OPTCG Deck Planner");
  await expect(page.getByRole("link", { name: "View on TCGPlayer" })).toHaveAttribute("href", "https://www.tcgplayer.com/product/5001");

  const arts = page.getByRole("region", { name: "Arts" });
  await expect(arts.getByRole("button", { name: /^Base/ })).toHaveAttribute("aria-pressed", "true");
  const panel = page.getByRole("region", { name: "Price history" });
  await expect(panel.locator("dl.ph-stats")).toContainText("Now$18.50");
  await expect(panel.getByLabel("When to buy")).toBeVisible();

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await arts.getByRole("button", { name: /^Alternate Art/ }).click();
  await expect(page).toHaveURL(/\/cards\/OP01-025\?art=5002$/);
  await expect(arts.getByRole("button", { name: /^Alternate Art/ })).toHaveAttribute("aria-pressed", "true");
  await expect(arts.getByRole("button", { name: /^Base/ })).toHaveAttribute("aria-pressed", "false");
  await expect(panel.locator("dl.ph-stats")).toContainText("Now$64.99");
  await expect(page.getByRole("link", { name: "View on TCGPlayer" })).toHaveAttribute("href", "https://www.tcgplayer.com/product/5002");

  // Back to the base art drops ?art from the URL.
  await arts.getByRole("button", { name: /^Base/ }).click();
  await expect(page).toHaveURL(/\/cards\/OP01-025$/);
  await expect(panel.locator("dl.ph-stats")).toContainText("Now$18.50");
});

test("?art in the link opens that printing (#953)", async ({ page, planner }) => {
  planner.signOut();
  await mockCardApi(page);
  await planner.open(`/cards/${ZORO}?art=5003`);
  await expect(page.getByRole("region", { name: "Arts" }).getByRole("button", { name: /^Manga/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Price history" }).locator("dl.ph-stats")).toContainText("Now$410.00");
});

test("tournament play lists the leaders that play the card and links to their meta page (#953)", async ({ page, planner }) => {
  planner.signOut();
  const asked = await mockCardApi(page);
  await planner.open(`/cards/${ZORO}`);

  const play = page.getByRole("region", { name: "Tournament play" });
  await expect(play).toContainText("27.8%");
  await expect(play).toContainText("3.6");
  const ace = play.getByRole("link", { name: /Portgas\.D\.Ace/ });
  await expect(ace).toContainText("61 of 128 decks · 47.7%");
  await expect(play.getByRole("link", { name: "[OP13] Regional Championship Tokyo" })).toHaveAttribute("href", "https://play.limitlesstcg.com/tournament/101");
  await expect(play.getByRole("link", { name: "Limitless TCG" })).toBeVisible();

  // A longer window asks again and keeps the card on screen.
  await play.locator(".meta-select").getByRole("button").click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/days=7/);
  await expect.poll(() => asked).toContain(`${ZORO}?days=7`);

  await ace.click();
  await expect(page).toHaveURL(/\/meta\?leader=OP13-002&days=7$/);
});

test("a Leader's page shows its meta share and links to its decks (#953)", async ({ page, planner }) => {
  planner.signOut();
  await mockCardApi(page);
  await planner.open(`/cards/${LEADER}`);
  const play = page.getByRole("region", { name: "Tournament play" });
  await expect(play).toContainText("Meta share");
  await expect(play).toContainText("11.1%");
  await expect(play.getByRole("region", { name: "Played by" })).toHaveCount(0);
  await play.getByRole("link", { name: "See decks" }).click();
  await expect(page).toHaveURL(/\/meta\?leader=OP01-001$/);
});

test("an unknown card says so instead of an empty page (#953)", async ({ page, planner }) => {
  planner.signOut();
  await mockCardApi(page);
  await planner.open("/cards/OP99-999");
  await expect(page.getByRole("heading", { name: "Card not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse the meta" })).toBeVisible();
});

test("signed in, the card page has the shopping and alert controls for the shown art (#953)", async ({ page, planner }) => {
  await mockCardApi(page);
  await planner.open(`/cards/${ZORO}?art=5002`);
  await expect(page.getByRole("heading", { name: "Roronoa Zoro", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /to shopping list/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /alert/i }).first()).toBeVisible();
});
