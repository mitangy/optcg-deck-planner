import { test, expect, RED_VANILLA, type Page } from "./fixtures";

async function startBotGameWithDice(page: Page, seed: number) {
  await page.route(`${process.env.E2E_GAME_SERVER ?? "http://127.0.0.1:2567"}/matchmake/create/**`, (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    return route.continue({ postData: JSON.stringify({ ...body, seed, diceRoll: true }) });
  });
  const decks = [
    { id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 },
    { id: "e2e-opp", name: "E2E Opponent", ...RED_VANILLA, updatedAt: 0 },
  ];
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ gameHints: true }));
  }, decks);
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Play vs Bot/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
}

type Box = { x: number; y: number; width: number; height: number } | null;
function expectSameBox(actual: Box, expected: Box) {
  expect(actual).not.toBeNull();
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(actual![k] - expected![k])).toBeLessThan(1);
}

async function expectFits(page: Page) {
  const fit = await page.evaluate(() => {
    const card = document.querySelector(".dice-phase")!.getBoundingClientRect();
    const de = document.documentElement;
    return {
      sideways: de.scrollWidth > de.clientWidth,
      inside: card.left >= 0 && card.right <= window.innerWidth && card.top >= 0 && card.bottom <= window.innerHeight,
    };
  });
  expect(fit).toEqual({ sideways: false, inside: true });
}

test("you call and lose the roll: the bot rolls, picks first, and the banner names the roll (#1190)", async ({ page, duel }) => {
  await startBotGameWithDice(page, 5);
  const card = page.locator(".dice-phase");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("status")).toHaveText("You call it: High or Low?");
  await expectFits(page);
  await expect(page.getByRole("button", { name: "Leave (counts as a loss)" })).toBeVisible();
  await card.getByRole("button", { name: "High (4-6)" }).click();

  await expect(card.getByRole("status")).toContainText("Rolled 1: Low. Bot (Normal) wins", { timeout: 10_000 });
  await expect(card.locator(".dice-die")).toHaveAttribute("data-face", "1");
  await expect(card.getByText("Bot (Normal) is choosing…")).toBeVisible();

  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".board-root")).toContainText("Bot (Normal) won the dice roll (1, High): you go second.");
  expect(duel.errors).toEqual([]);
});

test("you roll and win: Roll waits for the call, then you choose to go second (#1190)", async ({ page, duel }) => {
  await startBotGameWithDice(page, 2);
  const card = page.locator(".dice-phase");
  await expect(card).toBeVisible({ timeout: 30_000 });
  const roll = card.getByRole("button", { name: "Roll" });
  await expect(roll).toBeVisible();
  await expectFits(page);

  await expect(roll).toBeEnabled({ timeout: 10_000 });
  await expect(card.getByRole("status")).toContainText("called High");
  const before = await card.locator(".dice-actions").boundingBox();
  await roll.click();

  await expect(card.getByRole("status")).toHaveText("Rolled 3: Low. You win!", { timeout: 10_000 });
  await expect(card.locator(".dice-die")).toHaveAttribute("data-face", "3");
  const after = await card.locator(".dice-actions").boundingBox();
  expectSameBox(after, before);
  await expectFits(page);
  await card.getByRole("button", { name: "Go second" }).click();

  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".board-root")).toContainText("You won the dice roll (3, High) and chose to go second.");
  expect(duel.errors).toEqual([]);
});

const SIZES: { name: string; width: number; height: number; maxCardHeight?: number }[] = [
  { name: "desktop 1280x720", width: 1280, height: 720 },
  { name: "desktop 1440x900", width: 1440, height: 900 },
  { name: "phone portrait 375x812", width: 375, height: 812 },
  { name: "phone landscape 812x375", width: 812, height: 375, maxCardHeight: 240 },
];
for (const size of SIZES) {
  test(`the dice card keeps its size and slot through every step, ${size.name} (#1190)`, async ({ page, duel }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ gameHints: true })));
    await page.goto("/demo?dice=call");
    const card = page.locator(".dice-phase");
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Low (1-3)" })).toBeEnabled();
    // Web fonts change text metrics a little when they land; measure after.
    await page.evaluate(() => document.fonts.ready);
    const box = await card.boundingBox();
    const slot = await card.locator(".dice-actions").boundingBox();
    await expectFits(page);
    if (size.maxCardHeight) expect(box!.height).toBeLessThan(size.maxCardHeight);

    await card.getByRole("button", { name: "Low (1-3)" }).click();
    await expect(card.getByText("You called Low.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Low (1-3)" })).toBeDisabled();
    expectSameBox(await card.boundingBox(), box);
    expectSameBox(await card.locator(".dice-actions").boundingBox(), slot);

    await page.goto("/demo?dice=roll&diceroller=0&dicecall=low&diceroll=2");
    await expect(card.getByRole("button", { name: "Roll" })).toBeEnabled();
    expectSameBox(await card.boundingBox(), box);
    await card.getByRole("button", { name: "Roll" }).click();
    await expect(card.getByRole("status")).toHaveText("Rolled 2: Low. Zoro wins", { timeout: 5000 });
    await expect(card.getByText("Zoro is choosing…")).toBeVisible();
    expectSameBox(await card.boundingBox(), box);
    expectSameBox(await card.locator(".dice-actions").boundingBox(), slot);

    await page.goto("/demo?dice=choose&dicecall=low&diceroll=2");
    await expect(card.getByRole("status")).toHaveText("Rolled 2: Low. You win!");
    await expect(card.getByRole("button", { name: "Go first" })).toBeEnabled();
    expectSameBox(await card.boundingBox(), box);
    expectSameBox(await card.locator(".dice-actions").boundingBox(), slot);
    await expectFits(page);
    await card.getByRole("button", { name: "Go first" }).click();
    await expect(page.locator(".board-root")).toContainText("You won the dice roll (2, Low) and chose to go first.");
    expect(duel.errors).toEqual([]);
  });
}

test("a spectator sees the roll read-only with both names (#1190)", async ({ page }) => {
  await page.goto("/demo?dice=choose&spectate");
  const card = page.locator(".dice-phase");
  await expect(card).toContainText("Luffy");
  await expect(card).toContainText("Zoro");
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByText(/is choosing…/)).toBeVisible();
});
