/**
 * "Simple board on phones" (#445): on a portrait phone your own mat is
 * drawn the way the opponent's is (a count row instead of the four piles, the
 * same bigger cards). Off by default, and never on a desktop window.
 */
import type { Page } from "@playwright/test";
import { test, expect, formatIssues } from "./fixtures";
import { isKnown } from "./known-issues";

async function openDemo(page: Page, simple: boolean) {
  await page.addInitScript(
    (v) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ compactOwnBoard: v })),
    simple,
  );
  await page.goto("/demo?full");
  await page.locator(".side-you .zone-leader .card-tile").waitFor();
}

const leaderWidth = (page: Page, side: "you" | "opp") =>
  page.locator(`.side-${side} .zone-leader .card-tile`).evaluate((el) => el.getBoundingClientRect().width);

test("with Simple board on, your mat gets the opponent's count row and card size (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone layout");
  await openDemo(page, true);
  await expect(page.locator(".side-you.side-counts .count-chip")).toHaveCount(4);
  await expect(page.locator(".side-you .zone-trash")).toHaveCount(0);
  expect(await leaderWidth(page, "you")).toBeCloseTo(await leaderWidth(page, "opp"), 0);

  // The Trash count still opens the trash, like the pile did.
  await page.locator(".side-you .count-chip-trash").click();
  await expect(page.getByRole("dialog", { name: "Your trash" })).toBeVisible();
});

test("with Simple board off, your mat keeps its piles and smaller cards (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone layout");
  await openDemo(page, false);
  await expect(page.locator(".side-you.side-counts")).toHaveCount(0);
  await expect(page.locator(".side-you .zone-trash")).toHaveCount(1);
  expect(await leaderWidth(page, "you")).toBeLessThan(await leaderWidth(page, "opp"));
});

test("Simple board does nothing on a desktop window (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout");
  await openDemo(page, true);
  await expect(page.locator(".side-counts")).toHaveCount(0);
  await expect(page.locator(".side-you .zone-trash")).toHaveCount(1);
});

test("the full board passes the UI audit with Simple board on (#445)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone layout");
  await page.addInitScript(
    () => localStorage.setItem("optcg-duel:settings", JSON.stringify({ compactOwnBoard: true })),
  );
  for (const screen of ["?full", "?statuses", "?attack", "?counter=block"]) {
    await page.goto(`/demo${screen}`);
    await page.locator(".board-root").waitFor();
    const issues = (await duel.audit()).filter((i) => !isKnown(i));
    expect(issues, `${screen}: ${formatIssues(issues)}`).toEqual([]);
  }
});
