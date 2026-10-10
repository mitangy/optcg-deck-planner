/**
 * The menu on every page and the full leaderboard (#460). The FastAPI backend is
 * faked in the browser; nothing here signs in for real or creates an account.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

const test = base;

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

const players = (n: number, meAt: number | null) =>
  Array.from({ length: n }, (_, i) => ({
    user_id: meAt === i ? USER.id : 100 + i,
    name: `Player ${i + 1}`,
    username: meAt === i ? USER.username : `Rival${i + 1}`,
    rating: 1800 - i * 7,
    games_played: 60 - (i % 40),
  }));

async function fakeApi(page: Page, opts: { me?: { rank: number; rating: number; games: number }; entries?: unknown[] } = {}): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return opts.me ? route.fulfill({ json: USER }) : route.fulfill({ status: 401, json: { detail: "not signed in" } });
    if (path === "/duel/rating/me" && opts.me) {
      return route.fulfill({
        json: { user_id: USER.id, ...USER, rating: opts.me.rating, games_played: opts.me.games, wins: 20, losses: 10, rank: opts.me.rank },
      });
    }
    if (path === "/duel/leaderboard") {
      const limit = Number(new URL(route.request().url()).searchParams.get("limit") ?? "5");
      return route.fulfill({ json: { entries: (opts.entries ?? []).slice(0, limit) } });
    }
    if (path === "/duel/matches/me") return route.fulfill({ json: { matches: [] } });
    if (path === "/friends") return route.fulfill({ json: { friends: [], incoming: [], outgoing: [], invites: [] } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }]);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page scrolls sideways").toBeLessThanOrEqual(0);
}

async function menuWorks(page: Page): Promise<void> {
  await fakeApi(page);
  await page.goto("/settings");
  const button = page.getByRole("button", { name: "Menu" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  const before = (await button.boundingBox())!;
  const title = (await page.locator(".page-title").boundingBox())!;

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const drawer = page.getByRole("navigation", { name: "Site menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  await expect(drawer.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  expect((await drawer.getByRole("link").allInnerTexts()).map((t) => t.replace(/\s+/g, " "))).toEqual([
    "Home",
    "Leaderboard",
    "Decks",
    "Meta decks",
    "Match history",
    "What’s new",
    "Settings",
    "Deck planner ↗",
  ]);
  // Opening the drawer moves nothing in the header.
  expect(await button.boundingBox()).toEqual(before);
  expect(await page.locator(".page-title").boundingBox()).toEqual(title);
  await expect(drawer.getByRole("link").first()).toBeFocused();

  // Esc closes it and hands focus back to the button.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(button).toBeFocused();

  // So does a tap on the backdrop, past the drawer's right edge.
  await button.click();
  await expect(drawer).toBeVisible();
  // Wait for the slide-in to finish before aiming past its edge.
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
  const drawerBox = (await drawer.boundingBox())!;
  const vp = page.viewportSize()!;
  await page.mouse.click(Math.min(vp.width - 4, drawerBox.x + drawerBox.width + 12), vp.height - 8);
  await expect(drawer).toBeHidden();

  // A link lands on that page and closes the drawer.
  await button.click();
  await drawer.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Site menu" })).toBeHidden();
  await expect(page.locator(".home-deck")).toBeVisible();
  await noSidewaysScroll(page);

  // The lobby has the button too, and the menu takes you on from there.
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Site menu" }).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  // Choosing the page you are already on closes the drawer too.
  await page.getByRole("navigation", { name: "Site menu" }).getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("navigation", { name: "Site menu" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Site menu" }).getByRole("link", { name: "Leaderboard" }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
}

async function leaderboardRows(page: Page): Promise<void> {
  await fakeApi(page, { entries: players(100, 4), me: { rank: 5, rating: 1772, games: 56 } });
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  const rows = page.locator(".leaderboard-list .bounty-row");
  await expect(rows).toHaveCount(100);
  const first = rows.first();
  await expect(first).toContainText("Rival1");
  await expect(first.locator(".bounty-rank")).toHaveText("1");
  await expect(first.locator(".bounty-amount")).toHaveAccessibleName("Bounty 1,800 berries");
  await expect(first.locator(".leaderboard-games")).toHaveText("60");
  // Your row is highlighted in place; nothing is pinned under the list.
  await expect(rows.nth(4)).toHaveClass(/\bme\b/);
  await expect(rows.nth(4)).toContainText("You");
  await expect(page.locator(".bounty-row.pinned")).toHaveCount(0);
  await expect(page.getByText(/rating/i)).toHaveCount(0);
  await noSidewaysScroll(page);
  // Every row keeps all four columns inside the viewport.
  const vp = page.viewportSize()!;
  for (const i of [0, 4, 99]) {
    await rows.nth(i).scrollIntoViewIfNeeded();
    const cols = rows.nth(i).locator(".bounty-rank, .bounty-name, .leaderboard-bounty, .leaderboard-games");
    for (let c = 0; c < (await cols.count()); c++) {
      const b = (await cols.nth(c).boundingBox())!;
      expect(b.x, `row ${i} col ${c} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `row ${i} col ${c} right`).toBeLessThanOrEqual(vp.width);
    }
  }
}

async function pinnedYou(page: Page): Promise<void> {
  await fakeApi(page, { entries: players(100, null), me: { rank: 140, rating: 1203, games: 12 } });
  await page.goto("/leaderboard");
  const pinned = page.locator(".bounty-row.pinned");
  await expect(pinned).toBeVisible();
  await expect(pinned.locator(".bounty-rank")).toHaveText("140");
  await expect(pinned).toContainText("You");
  await expect(pinned.locator(".bounty-amount")).toHaveAccessibleName("Bounty 1,203 berries");
  await expect(pinned.locator(".leaderboard-games")).toHaveText("12");
  await expect(page.locator(".leaderboard-list .bounty-row")).toHaveCount(101);
}

for (const [label, size] of [
  ["", null],
  [" (phone landscape 812x375)", { width: 812, height: 375 }],
] as const) {
  test.describe(`menu and leaderboard${label}`, () => {
    if (size) test.use({ viewport: size, hasTouch: true });

    test.beforeEach(({}, testInfo) => {
      // The landscape size is set here, so one project covers it.
      if (size) test.skip(testInfo.project.name !== "desktop-1280", "viewport is set by the describe; one project is enough");
    });

    test(`the menu opens, closes and takes you home (#460)${label}`, async ({ page }) => {
      await menuWorks(page);
    });

    test(`the leaderboard lists ranked players with Bounty and games, and marks your row (#460)${label}`, async ({ page }) => {
      await leaderboardRows(page);
    });

    test(`the leaderboard pins You under a list you are not in (#460)${label}`, async ({ page }) => {
      await pinnedYou(page);
    });
  });
}

test("every page's header starts with the menu button (#460)", async ({ page }) => {
  await fakeApi(page, { entries: players(3, null) });
  for (const path of ["/", "/leaderboard", "/decks", "/decks/meta", "/decks/new", "/decks/e2e-you/configure", "/history", "/history/m1", "/whats-new", "/settings", "/terms", "/privacy", "/cookies"]) {
    await page.goto(path);
    await expect(page.locator("header").first(), path).toBeVisible();
    // The menu is the first control in the header, ahead of the Back link or the wordmark.
    const firstControl = await page.evaluate(() => document.querySelector("header")?.querySelector("a[href], button")?.getAttribute("aria-label"));
    expect(firstControl, path).toBe("Menu");
    await noSidewaysScroll(page);
  }
});

test("Top bounties on the home page opens the full leaderboard (#460)", async ({ page }) => {
  await fakeApi(page, { entries: players(100, 8), me: { rank: 9, rating: 1740, games: 40 } });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Top bounties" });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "See full leaderboard" }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.locator(".leaderboard-list .bounty-row")).toHaveCount(100);
});

test("the leaderboard says so when nobody has played ranked yet (#460)", async ({ page }) => {
  await fakeApi(page, { entries: [] });
  await page.goto("/leaderboard");
  await expect(page.getByText("No ranked games yet")).toBeVisible();
});
