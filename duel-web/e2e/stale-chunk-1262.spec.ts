/**
 * A tab left open across a deploy asks for the old build's chunk files, which are gone, so tapping Settings
 * (a page that loads on demand) left a blank screen (#1262, seen on an iPhone Duo). The page now reloads once
 * and opens Settings from the new build. The first request for the Settings module fails here, like a
 * deleted chunk.
 */
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
