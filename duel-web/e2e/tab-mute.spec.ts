import { test, expect, mintGameToken, FAKE_API, RED_VANILLA, pickMore } from "./fixtures";
import type { Page } from "@playwright/test";

const phone = (info: { project: { name: string } }) => info.project.name === "phone-375";

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
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }]);
  await page.goto("/");
  await pickMore(page, /^Play vs Bot/);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();

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

  await expect.poll(async () => (await tabMuteState(spec, onPhone)).name, { timeout: 15_000 }).toBe("Unmute this tab");
  expect(await tabMuteState(spec, onPhone)).toMatchObject({ pressed: "true", title: expect.stringMatching(/another tab/i) });
  expect(await tabMuteState(page, onPhone)).toMatchObject({ name: "Mute this tab", pressed: "false" });

  await page.close({ runBeforeUnload: true });
  await expect.poll(async () => (await tabMuteState(spec, onPhone)).name, { timeout: 15_000 }).toBe("Mute this tab");
  expect(await tabMuteState(spec, onPhone)).toMatchObject({ pressed: "false" });
});
