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
