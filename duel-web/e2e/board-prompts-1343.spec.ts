import { test, expect, type Page } from "./fixtures";

test.use({ legacyLayout: false });

const isDesktop = () => test.info().project.name === "desktop-1280";

type Box = { left: number; top: number; right: number; bottom: number };
async function box(page: Page, sel: string): Promise<Box> {
  return page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("Keep opening hand is the gold button and Mulligan the outline one (#1343)", async ({ page }) => {
  await page.goto("/demo?turn0");
  await page.locator(".board-root").waitFor();
  const bg = (name: RegExp) =>
    page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(await bg(/^Keep opening hand/)).toContain("linear-gradient");
  expect(await bg(/^Mulligan/)).toBe("none");
});

for (const size of [
  { name: "phone portrait", width: 375, height: 812 },
  { name: "phone landscape", width: 812, height: 375 },
  { name: "desktop", width: 1280, height: 720 },
]) {
  test(`the turn order banner stays off your own mat at the mulligan, ${size.name} (#1343)`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/demo?turn0");
    await page.locator(".turn-splash-card").waitFor();
    await page.waitForTimeout(400);
    const splash = await box(page, ".turn-splash-card");
    const you = await box(page, ".side-you");
    // The banner scales in from 0.85 to 1.04, so a few pixels of overshoot onto the mat's edge is the animation, not the placement.
    expect(overlaps(splash, { ...you, top: you.top + 8 }), "banner over your mat").toBe(false);
  });
}

test("you are told what attacks what above Pass block, in body text (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "the dock beside the board is desktop only");
  await page.goto("/demo?full&counter=block");
  const heading = page.locator(".dock-heading");
  await expect(heading).toContainText("attacks your Leader");
  await expect(heading).not.toContainText("→");
  const main = await box(page, ".primary-dock-main");
  expect((await box(page, ".dock-heading")).bottom, "heading above the button").toBeLessThanOrEqual(main.top);
  expect(await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  await expect(page.locator(".defend-rail .defend-line")).toHaveCount(0);
});

test("the Turn card's prompt that needs you reads in the normal text colour (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "the Turn card is in the side column on desktop");
  await page.goto("/demo?full&counter=block");
  const sub = page.locator(".turn-panel-respond .turn-banner-sub");
  await expect(sub).toContainText("is attacking");
  const [subColour, ink] = await Promise.all([
    sub.evaluate((el) => getComputedStyle(el).color),
    page.locator(".turn-player-name").first().evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(subColour).toBe(ink);
});

test("the attack summary is at least 12px on phones and does not overlap the chips (#1343)", async ({ page }) => {
  test.skip(isDesktop(), "phone layouts");
  for (const size of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size);
    await page.goto("/demo?full&counter=block");
    const line = page.locator(".defend-line-text");
    await expect(line).toContainText("attacks your Leader");
    expect(await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    expect(await page.locator(".defend-verdict").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    const lineBox = await box(page, ".defend-line");
    const chips = await box(page, ".defend-chips");
    expect(lineBox.bottom).toBeLessThanOrEqual(chips.top + 1);
  }
});

test("Play and replace a Character fits its button on a full board (#1343)", async ({ page }) => {
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const firstCard = page.locator(".hand-dock-cards > .card-tile, .hand-fan-cards > .card-tile, .rail-hand .card-tile").first();
  await firstCard.waitFor();
  await page.waitForTimeout(800);
  await firstCard.click({ force: true });
  const button = page.getByText("Play and replace a Character", { exact: true });
  await expect(button).toBeVisible();
  const fits = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  expect(fits).toEqual({ clipped: false, inside: true });
});

test("a rested Character says why it has no action (#1343)", async ({ page }) => {
  test.skip(isDesktop(), "the empty-actions hint is on the phone action bar");
  await page.goto("/demo?full");
  await page.locator('.side-you [data-instance-id="y-c2"]').first().click({ force: true });
  await expect(page.locator(".intent-empty")).toHaveText("This Character already attacked or is rested");
});

test("the match over card has one gold button and Change deck reveals the select without moving it (#1343)", async ({ page }) => {
  await page.goto("/demo?over");
  const card = page.locator(".modal-card.match-result");
  await expect(card).toBeVisible();
  await expect(card.locator(".btn-primary")).toHaveCount(1);
  await expect(card.locator(".btn-primary")).toHaveText("Ask for a rematch");
  await expect(card.locator(".rematch-deck")).toHaveCount(0);
  const before = await box(page, ".modal-card.match-result .btn-primary");
  const homeBefore = await box(page, ".match-result-home");
  await card.getByRole("button", { name: "Change deck" }).click();
  await expect(card.locator(".rematch-deck .ui-select-button")).toContainText("Keep same deck");
  expect(await box(page, ".modal-card.match-result .btn-primary")).toEqual(before);
  expect(await box(page, ".match-result-home")).toEqual(homeBefore);
  const secondary = await card.locator(".match-result-secondary .btn").allTextContents();
  expect(secondary).toEqual(["Review game", "View board", "Home"]);
  const cardBox = await box(page, ".modal-card.match-result");
  for (const b of await card.locator(".match-result-secondary .btn").all()) {
    const r = await b.evaluate((el) => ({ box: el.getBoundingClientRect(), clipped: el.scrollWidth > el.clientWidth + 1 }));
    expect(r.clipped).toBe(false);
    expect(r.box.left).toBeGreaterThanOrEqual(cardBox.left);
    expect(r.box.right).toBeLessThanOrEqual(cardBox.right);
  }
});

test("the guest match over card keeps one gold button and drops Review game (#1343)", async ({ page }) => {
  await page.goto("/demo?over&guest");
  const card = page.locator(".modal-card.match-result");
  await expect(card.locator(".btn-primary")).toHaveText("Ask for a rematch");
  await expect(card.locator(".match-result-secondary .btn")).toHaveText(["View board", "Home"]);
});

test("Return home is the gold button when the opponent has left (#1343)", async ({ page }) => {
  await page.goto("/demo?over&rematch=left");
  const card = page.locator(".modal-card.match-result");
  await expect(card.locator(".btn-primary")).toHaveText("Return home");
});
