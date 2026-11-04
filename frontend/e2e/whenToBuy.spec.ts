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
  const clipped = await buy.evaluate((el) => [...el.querySelectorAll<HTMLElement>("button, .ph-pill, .ph-buy-headline, .ph-buy-best, .ph-buy-note")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className || e.textContent));
  expect(clipped, "elements with cut-off text").toEqual([]);
  const row = (await buy.boundingBox())!;
  expect(row.x + row.width).toBeLessThanOrEqual(box.x + box.width);
}

test("Collection: a base art about four months old reads Good time, with its reasons behind the ? icon (#946)", async ({ page, planner }) => {
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
  await expect(buy.locator(".ph-buy-best")).toContainText("Best time: Now");
  await expect(buy).toContainText("Based on how similar cards moved after release, 2024–2026");
  // Released Sep 16, 2025: 121 days old, in January, so the winter note comes with it.
  const why = buy.getByRole("button", { name: "Why this read?" });
  await expect(why).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const [triggerBefore, panelBefore] = [await toggle.boundingBox(), await panel.boundingBox()];
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/page-base-good-closed-${test.info().project.name}.png` });
  await why.click();
  await expect(why).toHaveAttribute("aria-expanded", "true");
  const reasons = page.getByRole("tooltip");
  await expect(reasons.getByRole("listitem").first()).toContainText("Most of the typical drop is done at this age.");
  await expect(reasons).toContainText("tend to run higher in winter (peak in February)");
  await expect(reasons).toContainText("Typical patterns of past sets, not a forecast.");
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
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("the ? icon shows the reasons on hover or tap and the chart stays in view (#959)", async ({ page, planner }) => {
  const phone = test.info().project.name === "phone-375";
  await planner.open("/collection");
  await page.locator('[data-card-id="EB01-002"]:visible').locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  const why = panel.getByLabel("When to buy").getByRole("button", { name: "Why this read?" });
  const reasons = page.getByRole("tooltip");
  const chart = panel.locator(".ph-body");
  await expect(chart).toBeVisible();
  const [chartBefore, whyBefore] = [await chart.boundingBox(), await why.boundingBox()];
  await expect(reasons).toHaveCount(0);

  if (phone) {
    await why.tap();
    await expect(reasons).toContainText("Most of the typical drop is done at this age.");
    await expect(why).toHaveAttribute("aria-expanded", "true");
  } else {
    await why.hover();
    await expect(reasons).toContainText("Most of the typical drop is done at this age.");
  }
  // The chart and the icon stay put while the reasons show, and the reasons stay on screen.
  await expect(chart).toBeVisible();
  expect(await chart.boundingBox()).toEqual(chartBefore);
  expect(await why.boundingBox()).toEqual(whyBefore);
  const box = (await reasons.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/why-icon-${test.info().project.name}.png` });

  if (phone) {
    // Tapping the icon again closes it; tapping elsewhere does too.
    await why.tap();
    await expect(reasons).toHaveCount(0);
    await why.tap();
    await expect(reasons).toBeVisible();
    await panel.locator(".ph-title").tap();
    await expect(reasons).toHaveCount(0);
  } else {
    await page.mouse.move(0, 0);
    await expect(reasons).toHaveCount(0);
    // Keyboard focus shows it too, and Escape closes just the hint, not the enlarged card.
    await why.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(reasons).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reasons).toHaveCount(0);
    await expect(lightbox).toBeVisible();
  }
});

test("Collection: an alt art a month after release says wait and how far similar cards fell (#946)", async ({ page, planner }) => {
  await altHistory(page, { name: "Izo (Alternate Art)", released: "2025-12-16", current: 12, days: 30, price: (i) => 20 - i * 0.25 });
  const { panel } = await openAltPanel(page, planner);
  const buy = panel.getByLabel("When to buy");
  await expect(buy.locator(".ph-pill")).toHaveText("Wait");
  await expect(buy).toContainText("Better to wait");
  await buy.getByRole("button", { name: "Why this read?" }).click();
  await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveText([
    "Similar cards fell another ~24% by 6 months.",
    "Similar cards reached a buyable price about 6 weeks after release, around 21% below today's price.",
  ]);
  // Released Dec 16: buyable about 41 days on (Jan 26), a 60-day window, and $12 now is about $9.49 then.
  await expect(buy.locator(".ph-buy-best")).toHaveText("Best time: Jan 2026 – Mar 2026 · est. $8.54–$10.44");
  await expectFits(page, panel);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/alt-wait-open-${test.info().project.name}.png` });
});

test("On a 320px phone the best-time estimate moves to a second line instead of being cut off (#954)", async ({ page, planner }) => {
  test.skip(test.info().project.name !== "phone-375", "narrow phones only");
  await page.setViewportSize({ width: 320, height: 640 });
  await altHistory(page, { name: "Izo (Alternate Art)", released: "2025-12-16", current: 12, days: 30, price: (i) => 20 - i * 0.25 });
  const { panel } = await openAltPanel(page, planner);
  const best = panel.getByLabel("When to buy").locator(".ph-buy-best");
  await expect(best).toHaveText("Best time: Jan 2026 – Mar 2026 · est. $8.54–$10.44");
  const label = (await best.locator("strong").boundingBox())!;
  const est = (await best.locator(".ph-buy-est").boundingBox())!;
  expect(est.y).toBeGreaterThan(label.y);
  await expectFits(page, panel);
  // Both lines show in full: the line is tall enough for the wrapped estimate.
  expect(await best.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});

test("Collection: a Manga art holds its value and is judged against its 30-day average (#946)", async ({ page, planner }) => {
  await altHistory(page, { name: "Izo (Manga)", released: "2025-09-16", current: 80, days: 40, price: () => 100 });
  const { panel } = await openAltPanel(page, planner);
  const buy = panel.getByLabel("When to buy");
  await expect(buy.locator(".ph-pill")).toHaveText("Holds");
  await expect(buy).toContainText("Tends to hold its value");
  await buy.getByRole("button", { name: "Why this read?" }).click();
  await expect(page.getByRole("tooltip").getByRole("listitem").nth(1)).toHaveText("Now $80.00, 20% below its 30-day average of $100.00.");
  // The 30-day low and average are both $100, so the estimate is a single figure.
  await expect(buy.locator(".ph-buy-best")).toHaveText("Best time: Now, on a dip · est. ~$100");
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
  // With no recent points the estimate is just today's price.
  await expect(buy.locator(".ph-buy-best")).toHaveText("Best time: Now · est. ~$15");
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
