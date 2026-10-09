/**
 * What's new (#450): the public /whats-new page and the once-per-update card on
 * the signed-in pages. Runs at desktop-1200 and phone-375.
 */
import type { Page } from "@playwright/test";
import { expect, formatIssues, test } from "./fixtures";

const KEY = "optcg.patchNotes.lastSeen.planner";

/** Stores the last seen day before the first load only, so a reload keeps what the app wrote. */
async function seedLastSeen(page: Page, day: string | null) {
  await page.addInitScript(
    ([key, seen]) => {
      if (sessionStorage.getItem("wn-seeded")) return;
      sessionStorage.setItem("wn-seeded", "1");
      if (seen) localStorage.setItem(key, seen);
    },
    [KEY, day] as const,
  );
}

const card = (page: Page) => page.getByRole("region", { name: "What's new" });

test("the card shows after an update, overlays the page, and Got it keeps it away after a reload (#450)", async ({ page, planner }) => {
  await seedLastSeen(page, "2026-10-05");
  await planner.open("/decks");
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText("Meta deck browser");
  await expect(card(page)).not.toContainText("Choose your DON!! art"); // duel-only note

  const vp = page.viewportSize()!;
  const box = (await card(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const heading = (await page.getByRole("heading", { level: 1 }).first().boundingBox())!;

  await card(page).getByRole("button", { name: "Got it" }).click();
  await expect(card(page)).toBeHidden();
  expect(await page.getByRole("heading", { level: 1 }).first().boundingBox()).toEqual(heading);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test("See all opens the public list with planner notes only, and the footer links to it (#450)", async ({ page, planner }) => {
  await seedLastSeen(page, "2026-10-05");
  await planner.open("/decks");
  await card(page).getByRole("link", { name: "See all" }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole("heading", { name: "What’s new", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "October 8, 2026" })).toBeVisible();
  await expect(page.getByText("Fairer deck price for alt arts")).toBeVisible();
  await expect(page.getByText("Choose your DON!! art")).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "What’s new" })).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.goBack();
  await expect(card(page)).toBeHidden();
});

test("a first visit shows no card and records the newest update (#450)", async ({ page, planner }) => {
  await seedLastSeen(page, null);
  await planner.open("/decks");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(card(page)).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
