/**
 * Mute one tab (#934): spectating a game in one tab while dueling in another made the sound effects confusing. The
 * Mute this tab control silences only its own tab and the choice lives in that tab's sessionStorage. A spectator tab
 * also goes quiet by itself while another tab of the same browser has a live match open as a player.
 * The computer has a toolbar button (and the M key); the phone has an entry in the match menu.
 */
import { test, expect, mintGameToken, FAKE_API, RED_VANILLA } from "./fixtures";
import type { Page } from "@playwright/test";

const phone = (info: { project: { name: string } }) => info.project.name === "phone-375";

/** The control's name and pressed state: a toolbar button on the computer, a ⋯ menu entry on the phone. */
async function tabMuteState(page: Page, onPhone: boolean): Promise<{ name: string; pressed: string | null; title: string | null }> {
  if (onPhone) await page.getByRole("button", { name: "Match menu" }).first().click();
  const control = onPhone
    ? page.getByRole("menuitem", { name: /^(Mute|Unmute) this tab$/ })
    : page.getByRole("button", { name: /^(Mute|Unmute) this tab$/ });
  const state = {
    name: ((await control.getAttribute("aria-label")) ?? (await control.textContent()) ?? "").trim(),
    pressed: await control.getAttribute("aria-pressed"),
    title: await control.getAttribute("title"),
  };
  if (onPhone) await page.keyboard.press("Escape");
  return state;
}

async function clickTabMute(page: Page, onPhone: boolean): Promise<void> {
  if (onPhone) {
    await page.getByRole("button", { name: "Match menu" }).first().click();
    await page.getByRole("menuitem", { name: /^(Mute|Unmute) this tab$/ }).click();
  } else {
    await page.getByRole("button", { name: /^(Mute|Unmute) this tab$/ }).click();
  }
}

test("Mute this tab flips the control and the choice survives a reload of that tab (#934)", async ({ page }, info) => {
  const onPhone = phone(info);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();

  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Mute this tab", pressed: "false" });
  await clickTabMute(page, onPhone);
  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Unmute this tab", pressed: "true" });

  await page.reload();
  await page.locator(".board-root").waitFor();
  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Unmute this tab", pressed: "true" });

  await clickTabMute(page, onPhone);
  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Mute this tab", pressed: "false" });
});

test("the M key mutes and unmutes this tab on the computer (#934)", async ({ page }, info) => {
  test.skip(phone(info), "no keyboard on the phone");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await page.keyboard.press("m");
  expect(await tabMuteState(page, false)).toMatchObject({ name: "Unmute this tab", pressed: "true" });
  await page.keyboard.press("m");
  expect(await tabMuteState(page, false)).toMatchObject({ name: "Mute this tab", pressed: "false" });
});

test("a spectator tab goes quiet while another tab plays, and sound returns when that tab closes (#934)", async ({ page, duel, context }, info) => {
  const onPhone = phone(info);
  // A game against the bot is a normal online match (a practice room is hotseat on one device, which plays no part).
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }]);
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Play vs Bot/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();

  // Same browser context, so the two tabs share a BroadcastChannel.
  const spec = await context.newPage();
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
  await spec.goto(`/watch/${roomId}`);
  await spec.locator(".board-root").waitFor({ timeout: 30_000 });

  // The player's tab is never quieted by the watch tab, and the watch tab hears the player within a couple of beats.
  await expect.poll(async () => (await tabMuteState(spec, onPhone)).name, { timeout: 15_000 }).toBe("Unmute this tab");
  expect(await tabMuteState(spec, onPhone)).toMatchObject({ pressed: "true", title: expect.stringMatching(/another tab/i) });
  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Mute this tab", pressed: "false" });

  // Close the player's tab (it says bye, or goes stale within seconds): the watch tab is audible again by itself.
  await page.close({ runBeforeUnload: true });
  await expect.poll(async () => (await tabMuteState(spec, onPhone)).name, { timeout: 15_000 }).toBe("Mute this tab");
  expect(await tabMuteState(spec, onPhone)).toMatchObject({ pressed: "false" });
});
