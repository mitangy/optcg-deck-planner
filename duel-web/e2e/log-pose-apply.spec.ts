/**
 * Log Pose's Apply card (#400): the analyst suggests a deck edit, the card shows under the answer, Apply saves it
 * to the open deck through the editor's own save, and Undo puts it back. The analyst and the API are faked in the
 * browser; the deck editor, the card and the saved deck are the real ones.
 *
 * SHOTS=1 also saves screenshots of the card's states to test-results/shots/.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const DECK_ID = "e2e-apply";
const SHOTS_DIR = "test-results/shots";

const proposal = {
  id: "toolu_1",
  version: 1,
  target: { ref: `duel:${DECK_ID}`, name: "Red Vanilla", leader_id: "ST01-001" },
  summary: "Trade two Chopper for two Franky: a cheaper curve with the same plan.",
  lines: [
    { id: "ST01-010", name: "Franky", before: 0, after: 2, reason: "A cheap body that blocks early, so the leader stays safe on turns two and three." },
    { id: "ST01-006", name: "Tony Tony.Chopper", before: 4, after: 2, reason: "Four copies clog the hand." },
  ],
  base: RED_VANILLA.cards.reduce<{ id: string; copies: number }[]>((acc, id) => {
    const hit = acc.find((c) => c.id === id);
    if (hit) hit.copies++;
    else acc.push({ id, copies: 1 });
    return acc;
  }, []),
  legality: { legal: false, count: 20, problems: ["20 of 50 cards"], upcoming: [], ban_list_checked: true },
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

async function fakeLogPose(page: Page): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  const cors = { "access-control-allow-origin": "http://127.0.0.1:5174", "access-control-allow-credentials": "true" };
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({
      headers: cors,
      json: { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST },
    }),
  );
  await page.route(`${FAKE_API}/analyst/chat/threads/*`, (route) => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.route(`${ANALYST}/chat`, (route) => {
    const allow = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, accept",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: allow });
    return route.fulfill({
      status: 200,
      headers: { ...allow, "content-type": "text/event-stream" },
      body: sse([
        ["thread", { thread_id: 1 }],
        ["text", { delta: "Franky blocks early and Chopper clogs your hand. Take the card below." }],
        ["proposal", proposal],
        ["done", { thread_id: 1, cost_usd: 0.01, spent_today_usd: 0.01, daily_cap_usd: 3 }],
      ]),
    });
  });
}

const shot = async (page: Page, name: string, target = page.locator(".lp-panel")) => {
  if (process.env.SHOTS) await target.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
};

test("applies a Log Pose deck edit and undoes it (#400)", async ({ page }, info) => {
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
  await expect(stack("ST01-010")).toHaveCount(0);

  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const panel = page.locator(".lp-panel");
  await page.getByRole("button", { name: "Review this deck" }).click();

  const card = panel.getByRole("region", { name: "Suggested edit for Red Vanilla" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("A cheap body that blocks early");
  await expect(card).toContainText("Still not legal:");
  const apply = card.getByRole("button", { name: "Apply", exact: true });
  await expect(apply).toBeEnabled();
  const before = await apply.boundingBox();
  await shot(page, `${info.project.name}-1-ready`);

  await apply.click();
  // The deck editor behind the panel now holds the change.
  await expect(card.getByText("✓ Applied")).toBeVisible();
  await expect(stack("ST01-010").getByLabel("2 copies")).toBeVisible();
  await expect(stack("ST01-006").getByLabel("2 copies")).toBeVisible();
  // The control that said Apply keeps its place and size once it says Applied.
  const applied = await card.getByText("✓ Applied").boundingBox();
  expect(Math.abs(applied!.x - before!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(applied!.y - before!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(applied!.width - before!.width)).toBeLessThanOrEqual(1);
  await shot(page, `${info.project.name}-2-applied`);

  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await expect(stack("ST01-010")).toHaveCount(0);
  await expect(stack("ST01-006").getByLabel("4 copies")).toBeVisible();

  if (!process.env.SHOTS) return;

  if (info.project.name === "phone-375") {
    // Landscape phone: the drawer, with the card scrolled so its buttons show.
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(panel).toBeVisible();
    await card.getByRole("button", { name: "Apply", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS_DIR}/phone-landscape-ready.png` });
    await page.setViewportSize({ width: 375, height: 812 });
    return;
  }

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(card).toBeVisible();
  await shot(page, "desktop-ready");
  // A touched card changed in the editor: the card says so instead of applying over it.
  await page.getByRole("button", { name: "Remove one Tony Tony.Chopper" }).click();
  await expect(card.getByRole("button", { name: "Ask again" })).toBeVisible();
  await shot(page, "desktop-conflict");
  await page.getByRole("button", { name: "Add one Tony Tony.Chopper" }).click();
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card.getByText("Dismissed")).toBeVisible();
  await shot(page, "desktop-dismissed");
});
