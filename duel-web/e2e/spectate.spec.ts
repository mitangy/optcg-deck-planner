/**
 * Spectating an unranked room: the spectator sees both players' hands face up
 * (#250). A practice room is unranked, so a second browser watches it by id.
 */
import { test, expect, mintGameToken, FAKE_API } from "./fixtures";

const NEAR_HAND = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile";
// A spectator's far hand is a fan along the top of the board (#346); only the old strip / rail fan remain for hidden hands.
const FAR_HAND = ":is(.spec-far-cards .card-tile, .opp-fan-face, .opp-hand-face) >> visible=true";

test("a spectator of an unranked room sees both hands face up (#250)", async ({ page, duel, browser }, info) => {
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await duel.startPractice({ seed: 7 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();

  const watcher = await browser.newContext({ ...info.project.use });
  const spec = await watcher.newPage();
  await spec.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await spec.goto("/");
  await spec.getByRole("button", { name: "Play", exact: true }).click();
  await spec.getByRole("button", { name: /^Spectate/ }).click();
  await spec.getByLabel("Room id").fill(roomId!);
  await spec.getByRole("button", { name: "Watch", exact: true }).click();

  // Both opening hands (5 cards each), face up: card tiles, not backs.
  await expect(spec.locator(NEAR_HAND)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(FAR_HAND)).toHaveCount(5);
  await expect(spec.locator(".hand-back")).toHaveCount(0);
  await spec.screenshot({ path: info.outputPath("spectator.png") });
  await watcher.close();
  expect(duel.errors).toEqual([]);
});
