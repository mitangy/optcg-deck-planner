import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA, pickMore } from "./fixtures";

const test = base;

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

const game = {
  match_id: "m1",
  created_at: "2026-10-08T10:00:00+00:00",
  ranked: true,
  your_seat: 0,
  won: false,
  reason: "leader_battle_at_zero_life",
  turns: 9,
  your_leader_id: "ST01-001",
  opponent_leader_id: "OP01-001",
  opponent_name: "Rival1",
  rating_before: 1000,
  rating_after: 988,
  has_replay: false,
  finished: true,
};

async function openLobby(page: Page, opts: { signedIn?: boolean; path?: string } = {}): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/live") return route.fulfill({ json: { online: 12, matches: 3 } });
    if (!opts.signedIn) {
      if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    } else {
      if (path === "/auth/me") return route.fulfill({ json: USER });
      if (path === "/duel/rating/me") return route.fulfill({ json: { user_id: 7, ...USER, rating: 1488, games_played: 41, wins: 24, losses: 17, rank: 9 } });
      if (path === "/duel/leaderboard") return route.fulfill({ json: { entries: [] } });
      if (path === "/duel/matches/me") return route.fulfill({ json: { matches: [game] } });
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
  await page.goto(opts.path ?? "/");
}

test("Play now is the one big button, with Play a friend and More beside it, and no mode list (#1506)", async ({ page }) => {
  await openLobby(page);
  await expect(page.locator(".btn-play")).toContainText("Play now");
  await expect(page.locator(".mode-tiles button")).toHaveText([/^Play a friend/, /^More ways to play/]);
  await pickMore(page, /^Practice/);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Practice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to modes" })).toHaveCount(0);
});

test("signed out sees the Only on OPTCG Duel tiles, signed in sees For you instead (#1343)", async ({ page }) => {
  await openLobby(page);
  await expect(page.getByRole("heading", { name: "Only on OPTCG Duel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "For you" })).toHaveCount(0);
});

test.describe("signed in", () => {
  test("For you offers the review of the last game and no sales pitch, and Play now has no sign-in step (#1343)", async ({ page }) => {
    await openLobby(page, { signedIn: true });
    await expect(page.getByRole("heading", { name: "For you" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Review your last game/ })).toHaveAttribute("href", "/history/m1");
    await expect(page.getByRole("heading", { name: "Only on OPTCG Duel" })).toHaveCount(0);
    await expect(page.locator(".btn-play")).toContainText("Play now");
    await expect(page.getByRole("list", { name: "How it works" })).toHaveText("Pick a deckPlay");
  });

  test("empty Tournaments says so, and Your voyage shrinks to its content (#1343)", async ({ page }) => {
    await openLobby(page, { signedIn: true });
    await expect(page.locator(".tcard-empty")).toHaveText("No tournaments yet.");
    const card = (await page.locator(".voyage-card").boundingBox())!;
    expect(card.height, "voyage box has no empty space under its one line").toBeLessThan(120);
  });
});

for (const width of [1024, 1280, 1440]) {
  test.describe(`top bar at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`shows Decks, Leaderboard, History and Tournaments inline on one row, menu last (#1343) [${width}]`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
      await openLobby(page);
      const bar = page.locator("header.topbar");
      const nav = bar.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link")).toHaveText(["Decks", "Leaderboard", "History", "Tournaments"]);
      const barBox = (await bar.boundingBox())!;
      expect(barBox.x).toBe(0);
      expect(barBox.width).toBe(width);
      expect(barBox.height, "one row").toBeLessThan(90);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const menu = (await bar.getByRole("button", { name: "Menu" }).boundingBox())!;
      const gear = (await bar.getByRole("link", { name: "Settings", exact: true }).boundingBox())!;
      const chip = (await bar.locator(".account-chip").boundingBox())!;
      expect(menu.x).toBeGreaterThan(gear.x);
      expect(gear.x).toBeGreaterThan(chip.x);
      await expect(bar.getByRole("link", { name: "Match history" })).toHaveCount(0);

      await bar.getByRole("button", { name: "Menu" }).click();
      const drawer = page.getByRole("navigation", { name: "Site menu" });
      await expect(drawer.getByRole("link", { name: "Home" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Decks", exact: true })).toBeHidden();
      await expect(drawer.getByRole("link", { name: "Tournaments" })).toBeHidden();
      await expect(drawer.getByRole("link", { name: "Settings" })).toBeHidden();
      await expect(drawer.getByRole("link", { name: "Meta decks" })).toBeVisible();
    });
  });
}

test.describe("top bar below 1024px", () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test("keeps the menu and Settings, and the menu lists everything (#1343)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test");
    await openLobby(page);
    const bar = page.locator("header.topbar");
    await expect(bar.getByRole("navigation", { name: "Main" })).toBeHidden();
    await bar.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("navigation", { name: "Site menu" });
    await expect(drawer.getByRole("link", { name: "Decks", exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});

test.describe("footer", () => {
  test("is one short line on app pages and complete on the lobby and public pages (#1343)", async ({ page }) => {
    await openLobby(page, { path: "/settings" });
    const footer = page.locator("footer.site-footer");
    await expect(footer.getByRole("link")).toHaveText(["Terms", "Privacy"]);
    await expect(footer.getByRole("button", { name: "Send feedback" })).toBeVisible();
    await expect(footer).toContainText("Unofficial fan-made project, not affiliated with or endorsed by Bandai.");
    expect((await footer.boundingBox())!.height, "compact footer is a thin strip").toBeLessThan(110);

    await page.goto("/");
    await expect(footer.getByRole("link", { name: "Top leaders" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Rules of conduct" })).toBeVisible();
    await page.goto("/play-one-piece-tcg-online");
    await expect(footer.getByRole("link", { name: "OPTCG sim online" })).toBeVisible();
  });
});
