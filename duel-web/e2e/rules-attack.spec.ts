import { test, expect, type Page, keepBothHands } from "./fixtures";

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
  const again = page.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
  if (await again.isVisible().catch(() => false)) await again.click();
}

test("an unblocked Leader attack moves one Life card to the defender's hand", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "rules scenario; screen size does not matter");
  await duel.startPractice({ seed: 7 });
  const root = page.locator(".board-root");

  await keepBothHands(page);
  await expect(root).toHaveAttribute("data-phase", "main");
  await expect(root).toHaveAttribute("data-turn", "1");

  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  await page.keyboard.press("Space");
  if (await page.locator(".intent-btn-primary.armed").isVisible().catch(() => false)) {
    await page.keyboard.press("Space");
  }
  await expect(root).toHaveAttribute("data-turn", "2");

  await expect(root).toHaveAttribute("data-seat", "1");
  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  await expect(page.locator(".card-actions")).toContainText("Activate");
  await expect(page.getByRole("button", { name: /^Attack/ })).toHaveCount(0);
  await endTurn(page);

  await expect(root).toHaveAttribute("data-turn", "3");
  await expect(root).toHaveAttribute("data-seat", "0");
  const before = await stats(page, "opp");
  expect(before.life).toBe(5);
  await page.locator(".side-field.side-you .zone-leader .card-tile").click();
  await page.getByRole("button", { name: /^Attack Leader/ }).click();

  await expect(root).toHaveAttribute("data-seat", "1");
  for (const name of [/^Pass block$/, /^(Pass counter|Take hit|Resolve)$/]) {
    await page.locator(".intent-btn-primary", { hasText: name }).click();
  }

  await page.getByRole("button", { name: /^(No Trigger|Add to hand)$/ }).click();

  await expect(root).toHaveAttribute("data-seat", "0");
  await expect.poll(async () => (await stats(page, "opp")).life).toBe(before.life - 1);
  expect((await stats(page, "opp")).hand).toBe(before.hand + 1);
  expect(duel.errors).toEqual([]);
});
