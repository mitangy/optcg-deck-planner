import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA, pickMore } from "./fixtures";

const test = base;

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

async function openLobby(page: Page, opts: { signedIn?: boolean; live?: { online: number; matches: number } } = {}): Promise<{ urls: string[] }> {
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
  await page.addInitScript(({ decks: d }) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, { decks: [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }] });
  await page.goto("/");
  return { urls };
}

test.describe("guests and Ranked (#1391)", () => {
  test("Ranked asks a guest to sign in instead of queueing, and Play now instead searches for a casual game (#1391, #1506)", async ({ page }) => {
    const { urls } = await openLobby(page);
    await pickMore(page, /^Ranked/);
    const dialog = page.getByRole("dialog", { name: "Ranked needs an account" });
    await expect(dialog.getByRole("heading", { name: "Ranked needs an account" })).toBeVisible();
    await expect(dialog).toContainText("Sign in so your Bounty and match history are saved.");
    await expect(dialog.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/auth\/google\?return_to=/);
    await expect(page).not.toHaveURL(/\/duel/);
    expect(urls).not.toContain("/duel/guest-token");
    await dialog.getByRole("button", { name: "Play now instead" }).click();
    await expect.poll(() => urls.includes("/duel/guest-token"), "asks for a guest token to join the casual queue").toBe(true);
  });

  test("a guest sees no Ranked button on the page until More is opened (#1506)", async ({ page }) => {
    await openLobby(page);
    await expect(page.locator(".btn-play")).toContainText("Play now");
    await expect(page.getByRole("menuitem", { name: /Ranked/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ranked/ })).toHaveCount(0);
  });

  test("a signed-in player's Ranked tile does not show the sign-in sheet (#1391)", async ({ page }) => {
    const { urls } = await openLobby(page, { signedIn: true });
    await pickMore(page, /^Ranked/);
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

  test("the steps line sits under the play buttons, and the Only on tiles are one row of three (#1391, #1506)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
    await openLobby(page);
    const steps = page.getByRole("list", { name: "How it works" });
    await expect(steps.getByRole("listitem")).toHaveText(["Pick a deck", "Play", "Sign in to keep your record"]);
    const box = (await steps.boundingBox())!;
    const play = (await page.locator(".home-actions").boundingBox())!;
    expect(box.y, "below the buttons").toBeGreaterThan(play.y + play.height - 1);

    const tiles = page.locator(".only-duel-grid .only-tile");
    await expect(tiles).toHaveText([/Replays/, /Planner \+ prices/, /Crew themes/]);
    const ys = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size, "one row").toBe(1);
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
