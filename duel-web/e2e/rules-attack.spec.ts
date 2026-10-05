/**
 * Scripted rules scenario, clicked through the real UI: nobody may attack on
 * their first turn; on turn 3 the first player's Leader attacks, the defender
 * takes the hit, and the top Life card moves to the defender's hand (Life
 * 5 → 4, hand +1).
 *
 * The shuffle seed is fixed, so both opening hands are the same every run.
 * Rules don't depend on screen size, so this runs on the desktop project only.
 */
import { test, expect, type Page } from "./fixtures";

type Side = "you" | "opp";

async function stats(page: Page, side: Side) {
  const panel = page.locator(`.turn-player-${side} .turn-player-stats`);
  const value = async (label: string) =>
    Number(await panel.locator("dt", { hasText: new RegExp(`^${label}$`, "i") }).locator("xpath=following-sibling::dd[1]").innerText());
  return { life: await value("Life"), hand: await value("Hand") };
}

async function endTurn(page: Page) {
  const end = page.locator(".intent-btn-primary", { hasText: /End turn/ });
  await end.click();
  // With the confirm-end-turn setting on, the same button asks for a second tap.
  const again = page.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
  if (await again.isVisible().catch(() => false)) await again.click();
}

test("an unblocked Leader attack moves one Life card to the defender's hand", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "rules scenario; screen size does not matter");
  await duel.startPractice({ seed: 7 });
  const root = page.locator(".board-root");

  // Both players keep their opening hands.
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await expect(root).toHaveAttribute("data-phase", "main");
  await expect(root).toHaveAttribute("data-turn", "1");

  // Space ends the turn even while a board card has focus (it must not just re-select the card (#257)).
  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  await page.keyboard.press("Space");
  if (await page.locator(".intent-btn-primary.armed").isVisible().catch(() => false)) {
    await page.keyboard.press("Space");
  }
  await expect(root).toHaveAttribute("data-turn", "2");

  // Neither player may attack on their first turn: the Leader offers no attack.
  await expect(root).toHaveAttribute("data-seat", "1");
  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  // Card actions sit on the selected card (a popover), not in the intent bar.
  await expect(page.locator(".card-actions")).toContainText("Activate");
  await expect(page.getByRole("button", { name: /^Attack/ })).toHaveCount(0);
  await endTurn(page);

  // Turn 3: seat 0's Leader attacks seat 1's Leader (5000 vs 5000: the attacker wins ties).
  await expect(root).toHaveAttribute("data-turn", "3");
  await expect(root).toHaveAttribute("data-seat", "0");
  const before = await stats(page, "opp");
  expect(before.life).toBe(5);
  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  await page.getByRole("button", { name: /^Attack Leader/ }).click();

  // The device passes to the defender, who neither blocks nor counters.
  await expect(root).toHaveAttribute("data-seat", "1");
  for (const name of [/^Pass block$/, /^(Pass counter|Take hit|Resolve)$/]) {
    await page.locator(".intent-btn-primary", { hasText: name }).click();
  }

  // Back with the attacker: the defender lost one Life and drew it into hand.
  await expect(root).toHaveAttribute("data-seat", "0");
  await expect.poll(async () => (await stats(page, "opp")).life).toBe(before.life - 1);
  expect((await stats(page, "opp")).hand).toBe(before.hand + 1);
  expect(duel.errors).toEqual([]);
});
