/**
 * Scanning several cards on the Shopping page (#849): the tray counts copies of
 * each card, says what the shopping list still needs, and Mark as owned adds
 * them to the collection. Runs at desktop-1200 and phone-375.
 */
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("a Shopping scan counts copies of each card, shows what is still needed, and marks them owned (#849)", async ({ page, planner }) => {
  await planner.open("/");
  await expect(page.getByRole("list", { name: "Shopping totals" }).locator("li").nth(1).locator(".stat-value")).toHaveText("9");
  // Stand in for the detector: three Kid & Killer, two Izo and a Chopper the decks already cover.
  await page.evaluate(() => {
    const thumb = (c: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="50" height="70"><rect width="50" height="70" fill="${c}"/></svg>`)}`;
    const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const item = (cardId: string, color: string) => ({ quad, thumbUrl: thumb(color), cardId, inliers: 40, runnerUp: 5, confidence: "sure" });
    (window as unknown as Record<string, unknown>).__optcgTestMatchAll = async () => [
      item("EB01-003", "#c33"),
      item("EB01-002", "#36c"),
      item("EB01-003", "#c33"),
      item("EB01-006", "#3a3"),
      item("EB01-003", "#c33"),
      item("EB01-002", "#36c"),
    ];
  });
  await page.locator(".scan-open").first().click();
  // The Shopping scanner takes photos of several cards, like Collection's.
  const dialog = page.getByRole("dialog", { name: "Scan cards" });
  await expect(dialog).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await dialog.locator('input[type="file"]').last().setInputFiles({ name: "cards.png", mimeType: "image/png", buffer: png });

  await expect(dialog.getByRole("status")).toHaveText("6 cards found · 6 ready");
  const kid = dialog.locator('.scan-tray-row[data-card-id="EB01-003"]');
  const izo = dialog.locator('.scan-tray-row[data-card-id="EB01-002"]');
  const chopper = dialog.locator('.scan-tray-row[data-card-id="EB01-006"]');
  await expect(kid.locator(".scan-qty-n")).toHaveText("3");
  await expect(kid.locator(".scan-tray-need")).toHaveText("Still need 4");
  await expect(izo.locator(".scan-qty-n")).toHaveText("2");
  await expect(izo.locator(".scan-tray-need")).toHaveText("Still need 2");
  await expect(chopper.locator(".scan-tray-need")).toHaveText("Covered — you own 3 of 3");

  // Nothing in the tray spills sideways at phone width.
  for (const r of await dialog.locator(".scan-tray-row").all()) {
    const box = await r.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }

  await dialog.getByRole("button", { name: "Mark 6 as owned" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Marked" })).toHaveText("Marked 6 as owned");
  expect(planner.ownedAdds).toEqual([
    { items: [{ card_id: "EB01-003", add: 3 }, { card_id: "EB01-002", add: 2 }, { card_id: "EB01-006", add: 1 }] },
  ]);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
  await dialog.getByRole("button", { name: "Done" }).click();
  // The list refetches: 9 copies were left to buy, and the 5 scanned ones that were needed come off.
  const copies = page.getByRole("list", { name: "Shopping totals" }).locator("li").nth(1).locator(".stat-value");
  await expect(copies).toHaveText("4");
});
