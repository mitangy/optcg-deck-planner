import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { test, expect, seedDecks, signInAs, FAKE_API, type FakeAccount } from "./fixtures";

const NEAR_HAND = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile";
let nextUid = 100_000 + Math.floor(Math.random() * 800_000) * 10;
const account = (name: string): FakeAccount => ({ uid: nextUid++, name });
const KEEP = "Keep opening hand";

async function newDevice(browser: Browser, info: TestInfo, who: FakeAccount, like: Page): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...info.project.use, viewport: like.viewportSize()!, hasTouch: info.project.use.hasTouch || like.viewportSize()!.height < 500 });
  const page = await ctx.newPage();
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await signInAs(page, who);
  await seedDecks(page);
  return { ctx, page };
}

async function board(page: Page) {
  const root = page.locator(".board-root");
  await expect(root).toBeVisible({ timeout: 30_000 });
  return {
    phase: await root.getAttribute("data-phase"),
    turn: await root.getAttribute("data-turn"),
    seat: await root.getAttribute("data-seat"),
    hand: await page.locator(NEAR_HAND).count(),
  };
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.HANDOFF_SHOTS_DIR;
  if (!dir) return;
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${dir}/${vp.width > 600 && vp.height > 600 ? "desktop" : vp.height < 500 ? "phone-landscape" : "phone-portrait"}-${vp.width}x${vp.height}-${name}.png` });
}

async function practiceHandoff(ME: FakeAccount, page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void> }, browser: Browser, info: TestInfo) {
  await signInAs(page, ME);
  await duel.startPractice({ seed: 11 });
  await page.getByRole("button", { name: KEEP }).click();
  await expect(page.getByRole("button", { name: KEEP })).toBeVisible();
  const before = await board(page);
  expect(before.hand).toBeGreaterThan(0);

  const b = await newDevice(browser, info, ME, page);
  await b.page.goto("/");
  const card = b.page.getByRole("region", { name: "Resume match from another device" });
  await expect(card).toContainText("Match in progress on another device", { timeout: 30_000 });
  await shot(b.page, "lobby-resume");
  return { before, b, card };
}

const practiceTitle = "practice: the lobby of a second device resumes the match and the first device is told (#451)";

async function practiceScenario({ page, duel, browser }: { page: Page; duel: Parameters<typeof practiceHandoff>[2] & { errors: string[] }; browser: Browser }, info: TestInfo) {
  const { before, b, card } = await practiceHandoff(account("Nami"), page, duel, browser, info);
  await card.getByRole("button", { name: "Resume match" }).click();
  await expect(b.page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
  expect(await board(b.page)).toEqual(before);
  await shot(b.page, "board-after-takeover");

  await expect(page.getByRole("alertdialog")).toContainText("Continued on another device", { timeout: 30_000 });
  await shot(page, "old-device-overlay");

  await b.page.getByRole("button", { name: KEEP }).click();
  await expect(b.page.locator(".board-root")).toHaveAttribute("data-phase", /^(?!mulligan)/, { timeout: 30_000 });
  expect((await board(b.page)).phase).not.toBe(before.phase);
  expect((await board(page)).phase).toBe(before.phase);

  await page.getByRole("button", { name: "Play here instead" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 30_000 });
  await expect(b.page.getByRole("alertdialog")).toContainText("Continued on another device", { timeout: 30_000 });
  const phaseOnB = (await board(b.page)).phase;
  expect(phaseOnB).not.toBe("waiting");
  await expect.poll(async () => (await board(page)).phase, { timeout: 30_000 }).toBe(phaseOnB);
  await b.ctx.close();
  expect(duel.errors).toEqual([]);
}

test(practiceTitle, practiceScenario);

test.describe("phone landscape", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });
  test(`${practiceTitle} at 812x375`, async ({ page, duel, browser }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewport is set by the test; one project is enough");
    await practiceScenario({ page, duel, browser }, info);
  });
});

test("private room: the host moves to a third device while the guest plays on (#451)", async ({ page, browser }, info) => {
  const ME = account("Nami");
  const RIVAL = account("Zoro");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await signInAs(page, ME);
  await seedDecks(page);
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  expect(roomId).toBeTruthy();

  const rival = await newDevice(browser, info, RIVAL, page);
  await rival.page.goto("/");
  await rival.page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
  await rival.page.getByRole("tab", { name: "Join" }).click();
  await rival.page.getByLabel("Room id").fill(roomId);
  await rival.page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
  await expect(rival.page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
  const before = await board(page);
  expect(before.hand).toBeGreaterThan(0);

  const b = await newDevice(browser, info, ME, page);
  await b.page.goto("/");
  const card = b.page.getByRole("region", { name: "Resume match from another device" });
  await expect(card).toContainText("Your private room match is still running", { timeout: 30_000 });
  await card.getByRole("button", { name: "Resume match" }).click();
  await expect(b.page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
  expect(await board(b.page)).toEqual(before);
  await expect(page.getByRole("alertdialog")).toContainText("Continued on another device", { timeout: 30_000 });

  await b.page.getByRole("button", { name: KEEP }).click();
  await rival.page.getByRole("button", { name: KEEP }).click();
  await expect(b.page.locator(".board-root")).not.toHaveAttribute("data-phase", before.phase!, { timeout: 30_000 });
  await expect(rival.page.getByText(/won|victory|forfeit/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Play here instead" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 30_000 });
  await expect(b.page.getByRole("alertdialog")).toContainText("Continued on another device", { timeout: 30_000 });
  await b.ctx.close();
  await rival.ctx.close();
  expect(errors).toEqual([]);
});
