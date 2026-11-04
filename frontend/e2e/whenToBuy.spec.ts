/**
 * The price history panel's "When to buy" row (#946): a verdict from how similar cards moved after release,
 * its reasons one tap away, and an Ask Log Pose button where Log Pose is on. FIXED_NOW is 2026-01-15.
 * Runs at desktop-1200 and phone-375. WTB_SHOTS=<dir> also saves screenshots there.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const SHOTS = process.env.WTB_SHOTS;

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const day = (iso: string, plus: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + plus * 86_400_000).toISOString().slice(0, 10);

/** The alt art's history answers with this card instead of the fixture's empty one. */
async function altHistory(page: Page, art: { name: string; released: string; current: number; price: (i: number) => number; days: number }) {
  await page.route("**/api/catalog/cards/*/price-history*", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("product_id") === "0") return route.fallback();
    const points = Array.from({ length: art.days }, (_, i) => [day("2026-01-14", i - art.days + 1), art.price(i)]);
    return route.fulfill({
      json: { card_id: "EB01-002", product_id: Number(url.searchParams.get("product_id")), name: art.name, group_name: "Extra Booster: Memorial Collection", released: art.released, current: art.current, points },
    });
  });
}

async function openAltPanel(page: Page, planner: { open(path: string): Promise<void> }) {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  return { lightbox, panel: lightbox.getByRole("region", { name: "Price history" }) };
}

/** The row and the panel fit the screen: nothing runs past an edge, and text is not cut off. */
async function expectFits(page: Page, panel: ReturnType<Page["locator"]>) {
  const vw = page.viewportSize()!.width;
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const buy = panel.locator(".ph-buy");
  const clipped = await buy.evaluate((el) => [...el.querySelectorAll<HTMLElement>("button, .ph-pill, .ph-buy-headline, .ph-buy-note")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className || e.textContent));
  expect(clipped, "elements with cut-off text").toEqual([]);
  const row = (await buy.boundingBox())!;
  expect(row.x + row.width).toBeLessThanOrEqual(box.x + box.width);
}

test("Collection: a base art about four months old reads Good time, with its reasons behind Why (#946)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  const toggle = lightbox.getByRole("button", { name: "Price history" });
  await toggle.click();
  const panel = lightbox.getByRole("region", { name: "Price history" });

  const buy = panel.getByLabel("When to buy");
  await expect(buy.locator(".ph-pill")).toHaveText("Good time");
  await expect(buy).toContainText("A reasonable time to buy");
  await expect(buy).toContainText("Based on how similar cards moved after release, 2024–2026");
  // Released Sep 16, 2025: 121 days old, in January, so the winter note comes with it.
  const why = buy.getByRole("button", { name: "Why" });
  await expect(why).toHaveAttribute("aria-expanded", "false");
  await expect(buy.getByRole("list")).toHaveCount(0);
  const [triggerBefore, panelBefore] = [await toggle.boundingBox(), await panel.boundingBox()];
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/page-base-good-closed-${test.info().project.name}.png` });
  await why.click();
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(buy.getByRole("listitem").first()).toContainText("Most of the typical drop is done at this age.");
  await expect(buy).toContainText("tend to run higher in winter (peak in February)");
  // Opening the reasons does not move the button that opened the panel.
  expect(await toggle.boundingBox()).toEqual(triggerBefore);
  const panelAfter = (await panel.boundingBox())!;
  // It never grows past the top of the screen; a long list scrolls inside it.
  expect(panelAfter.y).toBeGreaterThanOrEqual(0);
  expect(panelBefore!.y).toBeGreaterThanOrEqual(0);
  await expectFits(page, panel);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/base-good-open-${test.info().project.name}.png` });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/page-base-good-open-${test.info().project.name}.png` });
  await why.click();
  await expect(buy.getByRole("list")).toHaveCount(0);
});

test("Collection: an alt art a month after release says wait and how far similar cards fell (#946)", async ({ page, planner }) => {
  await altHistory(page, { name: "Izo (Alternate Art)", released: "2025-12-16", current: 12, days: 30, price: (i) => 20 - i * 0.25 });
  const { panel } = await openAltPanel(page, planner);
  const buy = panel.getByLabel("When to buy");
  await expect(buy.locator(".ph-pill")).toHaveText("Wait");
  await expect(buy).toContainText("Better to wait");
  await buy.getByRole("button", { name: "Why" }).click();
  await expect(buy.getByRole("listitem")).toHaveText(["Similar cards fell another ~24% by 6 months."]);
  await expectFits(page, panel);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/alt-wait-open-${test.info().project.name}.png` });
});

test("Collection: a Manga art holds its value and is judged against its 30-day average (#946)", async ({ page, planner }) => {
  await altHistory(page, { name: "Izo (Manga)", released: "2025-09-16", current: 80, days: 40, price: () => 100 });
  const { panel } = await openAltPanel(page, planner);
  const buy = panel.getByLabel("When to buy");
  await expect(buy.locator(".ph-pill")).toHaveText("Holds");
  await expect(buy).toContainText("Tends to hold its value");
  await buy.getByRole("button", { name: "Why" }).click();
  await expect(buy.getByRole("listitem").nth(1)).toHaveText("Now $80.00, 20% below its 30-day average of $100.00.");
  await expectFits(page, panel);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/chase-holds-open-${test.info().project.name}.png` });
});

test("Collection: an alt art with no price points yet still gets the read from its release date (#946)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  const buy = panel.getByLabel("When to buy");
  // 121 days old, so an alt art has about 14% of its typical drop left.
  await expect(buy.locator(".ph-pill")).toHaveText("Almost");
  await expect(buy).toContainText("Close to a good price");
  await expectFits(page, panel);
});

test("Ask Log Pose sends the question for this art and closes the card so the answer shows (#946)", async ({ page, planner }) => {
  planner.enableLogPose();
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  await expect(panel.locator(".ph-pill")).toHaveText("Good time");
  const ask = panel.getByRole("button", { name: "Ask Log Pose" });
  await expectFits(page, panel);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/page-with-ask-${test.info().project.name}.png` });
  await ask.click();

  await expect(page.getByRole("dialog", { name: "Log Pose" })).toBeVisible();
  await expect(page.getByText("Because the deck has 15 cards.")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/page-ask-log-pose-${test.info().project.name}.png` });
  await expect(lightbox).toHaveCount(0);
  expect(planner.chats).toHaveLength(1);
  expect(planner.chats[0]!.message).toBe("When is the best time to buy Izo (base art, EB01-002)? Use its price history and how much it's being played.");
});

test("no Ask Log Pose while Log Pose is off (#946)", async ({ page, planner }) => {
  await planner.open("/collection");
  await page.locator('[data-card-id="EB01-002"]:visible').locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  await expect(panel.locator(".ph-pill")).toHaveText("Good time");
  await expect(panel.getByRole("button", { name: "Ask Log Pose" })).toHaveCount(0);
});
