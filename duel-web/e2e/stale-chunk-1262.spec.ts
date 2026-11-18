import { test, expect } from "./fixtures";

test("tapping Settings after a deploy removed its chunk reloads once and opens Settings (#1262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one run is enough");
  let failed = false;
  await page.route(/SettingsPage[-.]/, (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 404, body: "gone" });
  });
  await page.goto("/");
  await page.locator('a[aria-label="Settings"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: 15_000 });
  expect(failed).toBe(true);
});
