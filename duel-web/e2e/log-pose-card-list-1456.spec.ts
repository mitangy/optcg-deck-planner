import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const DECK_ID = "e2e-card-list";
// Screenshots are only taken when SHOTS_DIR is set, and go outside the repo.
const SHOTS_DIR = process.env.SHOTS_DIR;
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };

const list = {
  id: "toolu_list",
  kind: "card_list",
  title: "Red Straw Hat Crew cards",
  leader_id: "ST01-001",
  cards: [
    { id: "ST01-010", name: "Franky", type: "character", colors: ["red"], cost: 4, power: 6000, counter: 1000, reason: "A cheap body that blocks early." },
    { id: "ST01-011", name: "Brook", type: "character", colors: ["red"], cost: 2, power: 3000, counter: 2000, reason: "Two-cost blocker with a 2000 counter." },
    { id: "ST01-006", name: "Tony Tony.Chopper", type: "character", colors: ["red"], cost: 1, power: 1000, reason: "Already at four copies, so Add is off." },
  ],
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

async function fakeLogPose(page: Page) {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({ headers: cors, json: { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST } }),
  );
  await page.route(`${ANALYST}/chat`, (route) => {
    const allow = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: allow });
    return route.fulfill({
      status: 200,
      headers: { ...allow, "content-type": "text/event-stream" },
      body: sse([
        ["thread", { thread_id: 1 }],
        ["card_list", list],
        ["text", { delta: "Franky and Brook fit your Leader. Tap + on the ones you want." }],
        ["done", { thread_id: 1, cost_usd: 0.01, spent_today_usd: 0.01, daily_cap_usd: 3 }],
      ]),
    });
  });
}

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

test("Describe a card opens Log Pose with the start of a sentence, and a card list adds to the deck (#1456)", async ({ page }, info) => {
  await fakeLogPose(page);
  await page.addInitScript(
    ([id, deck]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA] as const,
  );
  await page.goto(`/decks/${DECK_ID}/configure`);
  const stack = (id: string) => page.locator("article.deck-stack", { hasText: id });
  await expect(stack("ST01-006").getByLabel("4 copies")).toBeVisible();

  // The Add cards section is a collapsible on a phone.
  const describe = page.getByRole("button", { name: "Describe a card" });
  if (!(await describe.isVisible())) await page.getByText("Add cards", { exact: true }).first().click();
  await expect(describe).toBeVisible();
  const box = await describe.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  await shot(page, `${info.project.name}-1-editor-button`);

  await describe.click();
  const input = page.getByLabel("Message Log Pose");
  await expect(input).toHaveValue("Find cards that ");
  await input.pressSequentially("fit red Straw Hat Crew");
  await page.keyboard.press("Enter");

  const card = page.locator(".lp-panel").getByRole("region", { name: "Cards: Red Straw Hat Crew cards" });
  await expect(card).toBeVisible();
  await expect(stack("ST01-010")).toHaveCount(0);
  await shot(page, `${info.project.name}-2-card-list`);
  const phone = info.project.name === "phone-375";
  if (phone && SHOTS_DIR) {
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await shot(page, "phone-landscape-2-card-list");
    await page.setViewportSize({ width: 375, height: 812 });
  }

  await card.getByRole("button", { name: /^Add one Franky/ }).click();
  await expect(stack("ST01-010").getByLabel(/1 cop/)).toBeVisible();
  await expect(card.getByRole("button", { name: /^Remove one Franky/ })).toBeEnabled();
  await expect(card.getByRole("button", { name: /^Add one Tony Tony.Chopper/ })).toBeDisabled();
  await shot(page, `${info.project.name}-3-after-add`);

  if (!SHOTS_DIR) return;
  if (phone) {
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await shot(page, "phone-landscape-3-after-add");
    await page.setViewportSize({ width: 375, height: 812 });
  }
  // Crew themes and light mode: the list and its steppers keep their contrast and alignment.
  for (const [theme, mode] of [["strawHat", "dark"], ["marines", "dark"], ["wano", "light"], ["nightSea", "light"]] as const) {
    await page.evaluate(([t, m]) => {
      if (t === "nightSea") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = t;
      if (m === "light") document.documentElement.dataset.mode = "light";
      else delete document.documentElement.dataset.mode;
    }, [theme, mode] as const);
    await card.scrollIntoViewIfNeeded();
    await shot(page, `${info.project.name}-theme-${theme}-${mode}`);
  }
});

// The compass is fixed bottom-right and the compact deck editor's bar is fixed along the bottom (#1458).
test("Log Pose compass sits above the deck editor's Add cards bar (#1458)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the bottom bar is a phone layout");
  await fakeLogPose(page);
  await page.addInitScript(
    ([id, deck]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA] as const,
  );
  await page.goto(`/decks/${DECK_ID}/configure`);
  await expect(page.locator("article.deck-stack", { hasText: "ST01-006" }).getByLabel("4 copies")).toBeVisible();

  for (const [width, height] of [[375, 812], [812, 375]] as const) {
    await page.setViewportSize({ width, height });
    const compass = page.locator(".lp-compass");
    const add = page.locator(".deck-bottom-add");
    const bar = page.locator(".deck-bottom-bar");
    await expect(compass).toBeVisible();
    await expect(add).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot(page, `${info.project.name}-1458-${width}x${height}`);
    const c = (await compass.boundingBox())!;
    const a = (await add.boundingBox())!;
    const b = (await bar.boundingBox())!;
    // The compass clears the whole bar, so it is not on top of Add cards either.
    expect(c.y + c.height, `${width}x${height}: compass bottom ${c.y + c.height} vs bar top ${b.y}`).toBeLessThanOrEqual(b.y);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(width);
    expect(a.y).toBeGreaterThanOrEqual(b.y);
    // Both take a tap at their centre: the topmost element there is the control itself.
    for (const [loc, box] of [[compass, c], [add, a]] as const) {
      const hit = await loc.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height / 2]);
      expect(hit).toBe(true);
    }
  }
});
