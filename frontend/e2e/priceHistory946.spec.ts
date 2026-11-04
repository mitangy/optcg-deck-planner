/**
 * The enlarged card has a Price history panel for the art it shows (#946): range buttons, whole-history
 * stats and a hover readout. Runs at desktop-1200 and phone-375.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Collection: the lightbox's Price history shows the stats and switches range (#946)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });

  const toggle = lightbox.getByRole("button", { name: "Price history" });
  const before = await toggle.boundingBox();
  await toggle.click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  await expect(panel).toBeVisible();
  // Opening the panel does not move the button.
  expect(await toggle.boundingBox()).toEqual(before);

  const stats = panel.locator("dl.ph-stats");
  await expect(stats).toContainText("Now$92.00");
  await expect(stats).toContainText("Peak$180.00Sep 24, 2025");
  await expect(stats).toContainText("Low since peak$84.00");
  await expect(stats).toContainText("From peak-48.9%");
  await expect(stats).toContainText("Released");
  await expect(stats).toContainText("Sep 16 '25");
  await expect(stats).toContainText("3 months ago");

  // 3M is the default; Max runs from $60 to $92.
  await expect(panel.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
  await expect(stats).toContainText("3M change");
  await panel.getByRole("button", { name: "Max" }).click();
  await expect(panel.getByRole("button", { name: "Max" })).toHaveAttribute("aria-pressed", "true");
  await expect(stats).toContainText("Max change+53.3%");
  await expect(panel.getByRole("img")).toHaveAccessibleName(/from Sep 17, 2025 to Jan 14, 2026/);

  // 1M starts later than Max.
  await panel.getByRole("button", { name: "1M" }).click();
  await expect(panel.getByRole("img")).toHaveAccessibleName(/from Dec 14, 2025 to Jan 14, 2026/);

  // Hovering the chart reads out a date and price.
  const chart = panel.getByRole("img");
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(panel.getByRole("status")).toContainText(/[A-Z][a-z]{2} \d{1,2}, 20\d\d\$\d+\.\d\d/);
});

test("Collection: an alt art without price history says so (#946)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const panel = lightbox.getByRole("region", { name: "Price history" });
  await expect(panel.getByText("No price history yet for this art")).toBeVisible();
  await expect(panel.getByText("Izo (Alternate Art)")).toBeVisible();
  await expect(panel.locator("dl.ph-stats")).toContainText("Now$14.99");
});
