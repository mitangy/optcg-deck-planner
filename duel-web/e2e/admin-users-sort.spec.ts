/**
 * Admin Users tab sorting (#1323). Header buttons (desktop grid) and the "Sort by" control (stacked layout) ask the
 * server for the order, because the list is paged. The FastAPI backend is faked in the browser and the admin is a
 * fake account (no production sign-in).
 */
import { expect, test, FAKE_API, signInAs, type Page } from "./fixtures";

const mk = (id: number, name: string, bot: number) => ({
  id, email: `${name.toLowerCase()}@example.com`, name, username: null, role: "user",
  created_at: `2026-10-0${id}T10:00:00Z`, banned_at: null, ban_reason: null, signup_source: {}, matches: 0, last_match_at: null,
  games: { ranked: 0, friends: 0, private: 0, bot, practice: 0 },
});
const USERS = [mk(1, "Ace", 5), mk(2, "Brook", 90), mk(3, "Chopper", 20)];

async function open(page: Page): Promise<URLSearchParams[]> {
  const calls: URLSearchParams[] = [];
  await signInAs(page, { uid: 1, name: "boss" });
  await page.route(`${FAKE_API}/admin/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/admin/me") return route.fulfill({ json: { role: "admin", can: { analytics: true, set_roles: true, ban: true, delete: true } } });
    if (url.pathname === "/admin/users") {
      calls.push(url.searchParams);
      const sort = url.searchParams.get("sort");
      const sign = url.searchParams.get("dir") === "desc" ? -1 : 1;
      const users = sort === "bot" ? [...USERS].sort((a, b) => sign * (a.games.bot - b.games.bot)) : USERS;
      return route.fulfill({ json: { total: users.length, users } });
    }
    return route.fulfill({ status: 500, json: { detail: "faked failure" } });
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await expect(page.locator(".adm-urow:not(.adm-uhead)")).toHaveCount(USERS.length);
  return calls;
}

const names = (page: Page) => page.locator(".adm-urow:not(.adm-uhead) .adm-ulink").allTextContents();

test("a header click sorts on the server, shows an arrow and the next click flips it (#1323)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the header row is only visible in the desktop grid");
  const calls = await open(page);
  expect(calls[0].get("sort"), "the first load keeps the default order").toBeNull();

  const header = page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Sort by Bot" }) });
  const button = header.getByRole("button");
  await expect(header).toHaveAttribute("aria-sort", "none");
  const before = await header.boundingBox();
  const labelBefore = await button.locator(".adm-usort-label").boundingBox();

  await button.click();
  await expect.poll(() => calls.at(-1)?.get("sort")).toBe("bot");
  expect(calls.at(-1)?.get("dir"), "counts start with the biggest").toBe("desc");
  expect(calls.at(-1)?.get("offset")).toBe("0");
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(button.locator(".adm-usort-arrow.active")).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Brook", "Chopper", "Ace"]);
  // The arrow lives in a fixed slot: the column and its label stay where they were.
  expect(await header.boundingBox()).toEqual(before);
  expect(await button.locator(".adm-usort-label").boundingBox()).toEqual(labelBefore);

  await button.click();
  await expect.poll(() => calls.at(-1)?.get("dir")).toBe("asc");
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(() => names(page)).toEqual(["Ace", "Chopper", "Brook"]);

  // A text column starts A to Z, and only one column is active.
  await page.getByRole("button", { name: "Sort by User" }).click();
  await expect.poll(() => calls.at(-1)?.get("sort")).toBe("user");
  expect(calls.at(-1)?.get("dir")).toBe("asc");
  await expect(header).toHaveAttribute("aria-sort", "none");

  // The choice is remembered.
  await page.reload();
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Sort by User" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("button", { name: "Sort by Actions" })).toHaveCount(0);
});

test("the stacked list sorts from the Sort by control (#1323)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the stacked layout is the phone one");
  const calls = await open(page);
  await expect(page.locator(".adm-uhead")).toBeHidden();
  const dir = page.getByRole("button", { name: /^Sort direction$/ });
  await expect(dir).toBeDisabled();

  await page.getByRole("button", { name: "Sort users by" }).click();
  await page.getByRole("option", { name: "Bot" }).click();
  await expect.poll(() => calls.at(-1)?.get("sort")).toBe("bot");
  expect(calls.at(-1)?.get("dir")).toBe("desc");
  await expect.poll(() => names(page)).toEqual(["Brook", "Chopper", "Ace"]);

  await page.getByRole("button", { name: /^Sorted descending/ }).click();
  await expect.poll(() => calls.at(-1)?.get("dir")).toBe("asc");
  await expect.poll(() => names(page)).toEqual(["Ace", "Chopper", "Brook"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("the Sort by control is hidden in the desktop grid (#1323)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only");
  await open(page);
  await expect(page.locator(".adm-sortby")).toBeHidden();
});
