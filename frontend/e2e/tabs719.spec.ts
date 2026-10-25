/**
 * The Import page's Paste / Upload row on the shared Headless UI Tabs (#719): real arrow keys, Home / End,
 * and the panel that goes with the selected tab. Runs at desktop-1200 and phone-375.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Import method: arrows and Home / End switch between pasting and uploading, and the panel follows (#719)", async ({ page, planner }) => {
  await planner.open("/import");
  const row = page.getByRole("tablist", { name: "Import method" });
  const paste = row.getByRole("tab", { name: "Paste deck code" });
  const upload = row.getByRole("tab", { name: "Upload file" });
  const code = page.getByRole("textbox", { name: "Deck code" });
  const file = page.locator('input[type="file"]');

  await expect(paste).toHaveAttribute("aria-selected", "true");
  await expect(code).toBeVisible();
  await expect(file).toHaveCount(0);

  await paste.focus();
  await page.keyboard.press("ArrowRight");
  await expect(upload).toBeFocused();
  await expect(upload).toHaveAttribute("aria-selected", "true");
  await expect(paste).toHaveAttribute("aria-selected", "false");
  await expect(file).toHaveCount(1);
  await expect(code).toHaveCount(0);
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Upload file");

  await page.keyboard.press("Home");
  await expect(paste).toHaveAttribute("aria-selected", "true");
  await expect(code).toBeVisible();
  await page.keyboard.press("End");
  await expect(upload).toHaveAttribute("aria-selected", "true");
  // Only the selected tab is in the Tab order, so one Tab leaves the row.
  await expect(paste).toHaveAttribute("tabindex", "-1");
});

test("Import form fits the viewport and the page does not scroll sideways (#722)", async ({ page, planner }) => {
  await planner.open("/import");
  const viewport = page.viewportSize()!;
  const fits = async (target: ReturnType<typeof page.locator>) => {
    const box = (await target.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  };
  await fits(page.locator(".import-form"));
  await fits(page.getByRole("textbox", { name: "Deck code" }));
  await fits(page.getByRole("button", { name: "Paste from clipboard" }));
  await fits(page.getByRole("button", { name: "Create deck" }));
  await fits(page.getByRole("textbox", { name: "Deck name" }));

  await page.getByRole("tab", { name: "Upload file" }).click();
  await fits(page.locator('input[type="file"]'));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
