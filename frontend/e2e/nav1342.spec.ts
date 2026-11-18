import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const primary = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Primary" });

test("desktop: four main links, a More menu with Alerts, Friends and Group buys, and no Import (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "phones use the bottom bar (next test)");
  await planner.open("/decks");
  const nav = primary(page);
  await expect(nav.getByRole("link")).toHaveText(["Shopping", "Decks", "Collection", "Meta"]);
  await expect(nav.getByRole("link", { name: "Import" })).toHaveCount(0);
  const more = nav.getByRole("button", { name: /^More/ });
  await expect(more).not.toHaveAttribute("aria-current", "page");
  await more.click();
  await expect(page.getByRole("menuitem")).toHaveText([/^Alerts/, /^Friends/, /^Group buys/]);
  await page.getByRole("menuitem", { name: "Alerts" }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(more).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("phone: every page is one tap from the bottom bar, with no sideways scrolling, and the bar hides no content (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "desktop keeps the links in the top bar");
  await planner.open("/");
  const bar = primary(page);
  const box = (await bar.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeCloseTo(vp.height, 0);
  expect(box.x).toBe(0);
  expect(box.width).toBeCloseTo(vp.width, 0);
  for (const target of await bar.locator("a, button").all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".topbar nav")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  for (const [name, path] of [["Decks", /\/decks$/], ["Collection", /\/collection$/], ["Meta", /\/meta$/], ["Shopping", /\/$/]] as const) {
    await bar.getByRole("link", { name }).click();
    await expect(page).toHaveURL(path);
    await expect(bar.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
  for (const [name, path] of [["Alerts", /\/alerts$/], ["Friends", /\/friends$/], ["Group buys", /\/group-buys$/]] as const) {
    await bar.getByRole("button", { name: /^More/ }).click();
    await page.getByRole("menuitem", { name }).click();
    await expect(page).toHaveURL(path);
    await expect(bar.getByRole("button", { name: /^More/ })).toHaveAttribute("aria-current", "page");
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = (await page.locator(".site-footer").boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual((await bar.boundingBox())!.y + 1);
});

test("What's new keeps the signed-in menu, and the build id sits in the footer, not the top bar (#1342)", async ({ page, planner }) => {
  await planner.open("/whats-new");
  await expect(page.getByRole("heading", { name: "What’s new", level: 1 })).toBeVisible();
  const nav = primary(page);
  await expect(nav.getByRole("link", { name: "Shopping" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.locator(".topbar .build-tag")).toHaveCount(0);
  await expect(page.locator(".site-footer .build-tag")).toHaveText("e2e0000");
});
