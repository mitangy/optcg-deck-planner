/**
 * The lobby: the FastAPI backend is faked in the browser, like e2e/fixtures.ts.
 * As a guest it needs only /health and /auth/me (401 = signed out); signed in it
 * also reads the Bounty, the leaderboard, your last games and your friends.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

const test = base;

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

const game = (i: number, over: Record<string, unknown> = {}) => ({
  match_id: `m${i}`,
  created_at: "2026-10-08T10:00:00+00:00",
  ranked: true,
  your_seat: 0,
  won: true,
  reason: "leader_battle_at_zero_life",
  turns: 9,
  your_leader_id: "ST01-001",
  opponent_leader_id: "OP01-001",
  opponent_name: `Rival${i}`,
  rating_before: 1000,
  rating_after: 1016,
  has_replay: false,
  finished: true,
  ...over,
});

async function openLobby(page: Page, opts: { signedIn?: boolean } = {}): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (!opts.signedIn) {
      if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    } else {
      if (path === "/auth/me") return route.fulfill({ json: USER });
      if (path === "/duel/rating/me") {
        return route.fulfill({
          json: { user_id: 7, ...USER, rating: 1488, games_played: 41, wins: 24, losses: 17, rank: 9 },
        });
      }
      if (path === "/duel/leaderboard") {
        return route.fulfill({
          json: {
            entries: [1612, 1544, 1531, 1500, 1492].map((rating, i) => ({
              user_id: 100 + i,
              name: `Player ${i + 1}`,
              username: `Rival${i + 1}`,
              rating,
              games_played: 30,
            })),
          },
        });
      }
      if (path === "/duel/matches/me") {
        return route.fulfill({ json: { matches: [game(1), game(2), game(3, { won: false, rating_after: 988 })] } });
      }
      if (path === "/friends") {
        return route.fulfill({
          json: {
            friends: [{ user_id: 9, username: "NamiNavigator", status: "online", room_id: null, ranked: false }],
            incoming: [],
            outgoing: [],
            invites: [],
          },
        });
      }
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  const decks = [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }];
  await page.addInitScript((d) => {
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, decks);
  await page.goto("/");
  await expect(page.locator(".home-deck")).toBeVisible();
}

test("shows the deck's leader name as plain text, not a pill (#431)", async ({ page }) => {
  await openLobby(page);
  const leader = page.locator(".home-deck-leader");
  await expect(leader).toBeVisible();
  await expect(leader).toHaveCSS("border-top-width", "0px");
});

test("signed in at 1280x720, your voyage and Friends sit right of the deck and above the fold (#431)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "the two-column layout starts at 1000px");
  await openLobby(page, { signedIn: true });
  await expect(page.getByRole("link", { name: /vs Rival1/ })).toBeVisible();
  const deck = (await page.locator(".home-deck").boundingBox())!;
  const side = (await page.locator(".home-side").boundingBox())!;
  const friends = (await page.getByRole("region", { name: "Friends" }).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(side.x, "side column starts right of the deck").toBeGreaterThanOrEqual(deck.x + deck.width);
  expect(friends.y, "Friends starts on the first screen").toBeLessThan(vp.height);
  expect(friends.x).toBeGreaterThanOrEqual(deck.x + deck.width);
});

test.describe("phone landscape", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("phone landscape fits Play and the deck on the first screen (#431)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "viewport is set by the test; one project is enough");
    await openLobby(page);
    await expect(page.locator(".home-brand")).toBeHidden();
    const vp = page.viewportSize()!;
    for (const sel of [".btn-play", ".home-deck"]) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box, sel).not.toBeNull();
      expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(0);
      expect(box.x, `${sel} left`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height);
      expect(box.x + box.width, `${sel} right`).toBeLessThanOrEqual(vp.width);
    }
  });
});
