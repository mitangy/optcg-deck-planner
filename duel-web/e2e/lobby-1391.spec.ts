import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

const test = base;

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

async function openLobby(page: Page, opts: { signedIn?: boolean; live?: { online: number; matches: number }; lastMode?: string } = {}): Promise<{ urls: string[] }> {
  const urls: string[] = [];
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    urls.push(path);
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/live") return route.fulfill({ json: opts.live ?? { online: 12, matches: 3 } });
    if (!opts.signedIn) {
      if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    } else {
      if (path === "/auth/me") return route.fulfill({ json: USER });
      if (path === "/duel/rating/me") return route.fulfill({ json: { user_id: 7, ...USER, rating: 1488, games_played: 41, wins: 24, losses: 17, rank: 9 } });
      if (path === "/duel/leaderboard") return route.fulfill({ json: { entries: [] } });
      if (path === "/duel/matches/me") return route.fulfill({ json: { matches: [] } });
      if (path === "/friends") return route.fulfill({ json: { friends: [], incoming: [], outgoing: [], invites: [] } });
      if (path === "/tournaments") return route.fulfill({ json: { tournaments: [] } });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.addInitScript(({ decks: d, lastMode }) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
    if (lastMode) localStorage.setItem("optcg-duel:lastPlayMode", lastMode);
  }, { decks: [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }], lastMode: opts.lastMode });
  await page.goto("/");
  return { urls };
}

test.describe("guests and Ranked (#1391)", () => {
  test("the Ranked tile asks a guest to sign in instead of queueing, and Play vs Bot instead opens the bot setup (#1391)", async ({ page }) => {
    await openLobby(page);
    await page.locator(".mode-tiles").getByRole("button", { name: /^Ranked/ }).click();
    const dialog = page.getByRole("dialog", { name: "Ranked needs an account" });
    await expect(dialog.getByRole("heading", { name: "Ranked needs an account" })).toBeVisible();
    await expect(dialog).toContainText("Sign in so your Bounty and match history are saved.");
    await expect(dialog.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/auth\/google\?return_to=/);
    await expect(page).not.toHaveURL(/\/duel/);
    await dialog.getByRole("button", { name: "Play vs Bot instead" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Play vs Bot" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/duel/);
  });

  test("a guest whose last mode was Ranked still gets Play vs Bot on the big button, never the queue (#1391)", async ({ page }) => {
    await openLobby(page, { lastMode: "queue" });
    await expect(page.locator(".btn-play")).toContainText("Play vs Bot");
    await expect(page.getByRole("button", { name: /Play Ranked/ })).toHaveCount(0);
  });

  test("a signed-in player's Ranked tile does not show the sign-in sheet (#1391)", async ({ page }) => {
    const { urls } = await openLobby(page, { signedIn: true });
    await page.locator(".mode-tiles").getByRole("button", { name: /^Ranked/ }).click();
    await expect.poll(() => urls.includes("/duel/token"), "asks for a game token to join the queue").toBe(true);
    await expect(page.getByRole("dialog", { name: "Ranked needs an account" })).toHaveCount(0);
  });
});

test.describe("live line and tiles (#1391)", () => {
  test("with no live matches the page says so in one line and Invite a friend opens the private room (#1391)", async ({ page }) => {
    await openLobby(page, { live: { online: 0, matches: 0 } });
    const line = page.getByRole("status").filter({ hasText: "No live matches right now" });
    await expect(line).toContainText("No live matches right now · Invite a friend");
    await expect(line.getByRole("button"), "only the Invite link").toHaveCount(1);
    await line.getByRole("button", { name: "Invite a friend" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Private room" })).toBeVisible();
  });

  test("the Last played tag sits on the tile of the mode played last, and on no tile before that (#1391)", async ({ page }) => {
    await openLobby(page, { lastMode: "hotseat" });
    await expect(page.locator(".mode-tile-tag")).toHaveCount(1);
    await expect(page.locator(".mode-tiles button").filter({ hasText: "Last played" })).toContainText("Practice");
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("optcg-duel:lastPlayMode"));
    await page.reload();
    await expect(page.locator(".mode-tile-tag")).toHaveCount(0);
    await expect(page.locator('.mode-tile[aria-current="true"]')).toHaveCount(0);
  });
});

test.describe("desktop 1280 (#1391)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a guest sees the OPTCG Duel headline with its tagline, a signed-in player does not (#1391)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
    await openLobby(page);
    await expect(page.getByRole("heading", { level: 1, name: "OPTCG Duel" })).toBeVisible();
    await expect(page.getByText("Play the One Piece Card Game online. Free, in your browser.")).toBeVisible();
    await page.unrouteAll();
    await page.context().clearCookies();
    await page.evaluate(() => sessionStorage.clear());
    await openLobby(page, { signedIn: true });
    const h1 = page.getByRole("heading", { level: 1, name: "OPTCG Duel" });
    await expect(h1).toBeAttached();
    expect((await page.locator(".home-hero").boundingBox())!.width, "clipped to nothing").toBeLessThanOrEqual(2);
  });

  test("the how-it-works card tops the right column, the Only on tiles are one row of three, and Got it dismisses (#1391)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
    await openLobby(page);
    const intro = page.getByRole("region", { name: "How it works" });
    await expect(intro).toBeVisible();
    const side = (await page.locator(".home-side").boundingBox())!;
    const box = (await intro.boundingBox())!;
    const play = (await page.locator(".home-actions").boundingBox())!;
    expect(box.x, "right column").toBeGreaterThan(play.x + play.width - 1);
    expect(box.y, "first card of the right column").toBeLessThan(side.y + 2);

    const tiles = page.locator(".only-duel-grid .only-tile");
    await expect(tiles).toHaveText([/Replays/, /Planner \+ prices/, /Crew themes/]);
    const ys = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size, "one row").toBe(1);

    await intro.getByRole("button", { name: "Got it" }).click();
    await expect(intro).toHaveCount(0);
  });
});

test.describe("wide screen 2560 (#1391)", () => {
  test.use({ viewport: { width: 2560, height: 1440 } });

  test("the top bar Sign in button and Guest pill stay on one line and the page does not scroll sideways (#1391)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
    await openLobby(page);
    const signIn = page.locator("header.topbar").getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    const lines = (el: Element) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size;
    };
    expect(await signIn.evaluate(lines), "Sign in is one line").toBe(1);
    await expect(page.locator(".account-name")).toHaveText("Guest");
    const name = page.locator(".account-name");
    expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth), "name not cut").toBeLessThanOrEqual(0);
    const tile = (await page.locator(".only-duel-grid .only-tile").first().boundingBox())!;
    const blurb = await page.locator(".only-duel-grid .only-tile-blurb").first().evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(blurb, "tile text is at most two lines").toBeLessThanOrEqual(2.1);
    expect(tile.width).toBeGreaterThan(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
