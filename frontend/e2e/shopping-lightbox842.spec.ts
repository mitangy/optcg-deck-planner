/**
 * "Add to shopping list" under the enlarged card (#842): signed-in pages offer it,
 * public pages do not. Runs at desktop-1200 and phone-375.
 */
import { SHARE_TOKEN, expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("the enlarged card on Collection adds a single card to the shopping list (#842)", async ({ page, planner }) => {
  await planner.open("/collection");
  // Chopper: three owned and in no deck, so nothing is on the shopping list for him yet.
  await page.locator('[data-card-id="EB01-006"]:visible').getByTitle("Expand card").click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await expect(lightbox).toContainText("Owned 3");
  const add = lightbox.getByRole("button", { name: "Add EB01-006 to shopping list" });
  await expect(add).toHaveText("Add to shopping list");
  const before = await lightbox.locator(".shopping-extra-control").boundingBox();

  await add.click();
  // One more copy than owned: target 4, so one to buy.
  await expect.poll(() => planner.extras.get("EB01-006")).toBe(4);
  expect(planner.requests).toContain("PUT /shopping/extras/EB01-006");
  await expect(lightbox.locator(".deck-editor-qty")).toHaveText("1");
  await expect(lightbox.getByRole("button", { name: "Add EB01-006 to shopping list" })).toHaveCount(0);

  // Add and the stepper take the same slot, so the row does not jump.
  const after = await lightbox.locator(".shopping-extra-control").boundingBox();
  expect(Math.abs(after!.x + after!.width / 2 - (before!.x + before!.width / 2))).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(2);

  await lightbox.getByRole("button", { name: "Buy more EB01-006" }).click();
  await expect.poll(() => planner.extras.get("EB01-006")).toBe(5);

  const box = await lightbox.locator(".lightbox-action").boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("the enlarged card on a public share page has no shopping control (#842)", async ({ page, planner }) => {
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  await page.getByTitle("Expand card").filter({ visible: true }).first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await expect(lightbox.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(lightbox.getByRole("button", { name: /shopping list/ })).toHaveCount(0);
  await expect(lightbox.locator(".lightbox-action")).toHaveCount(0);
});
