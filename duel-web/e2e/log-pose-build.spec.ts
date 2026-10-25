/**
 * Log Pose builds and edits decks (#726): an edit it was asked to make applies to the open deck by itself (Undo on the card),
 * and a new deck opens the create-deck page with the list filled in. A reload shows both cards without acting again. The analyst
 * and the API are faked in the browser; the panel, the deck editor and the create page are the real ones.
 *
 * SHOTS=1 also saves screenshots to test-results/shots/.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const DECK_ID = "e2e-build";
const SHOTS_DIR = "test-results/shots";
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };

const copiesOf = (cards: string[]) =>
  cards.reduce<{ id: string; copies: number }[]>((acc, id) => {
    const hit = acc.find((c) => c.id === id);
    if (hit) hit.copies++;
    else acc.push({ id, copies: 1 });
    return acc;
  }, []);

const edit = {
  id: "toolu_edit",
  version: 1,
  apply: true,
  target: { ref: `duel:${DECK_ID}`, name: "Red Vanilla", leader_id: "ST01-001" },
  summary: "Two Chopper out, two Franky in.",
  lines: [
    { id: "ST01-010", name: "Franky", before: 0, after: 2, reason: "A cheap body that blocks early." },
    { id: "ST01-006", name: "Tony Tony.Chopper", before: 4, after: 2, reason: "Four copies clog the hand." },
  ],
  base: copiesOf(RED_VANILLA.cards),
  legality: { legal: false, count: 20, problems: ["20 of 50 cards"], upcoming: [], ban_list_checked: true },
};

const draft = {
  id: "toolu_draft",
  version: 1,
  name: "Log Pose Red",
  leader_id: "ST01-001",
  leader_name: "Monkey.D.Luffy",
  summary: "Plain red beats: curve out and swing.",
  cards: [
    { id: "ST01-003", name: "Nami", copies: 4 },
    { id: "ST01-006", name: "Tony Tony.Chopper", copies: 4 },
    { id: "ST01-008", name: "Nico Robin", copies: 4 },
  ],
  count: 12,
  legality: { legal: true, problems: [], upcoming: [], ban_list_checked: true },
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

/** The analyst answers every message with `events`; a saved thread 1 comes back with `saved` (a reload). */
async function fakeLogPose(page: Page, events: [string, unknown][], saved: { proposals?: unknown[]; drafts?: unknown[] }) {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({ headers: cors, json: { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST } }),
  );
  await page.route(`${FAKE_API}/analyst/chat/threads/1`, (route) =>
    route.fulfill({
      headers: cors,
      json: { id: 1, title: "t", messages: [{ role: "user", text: "Do it" }, { role: "assistant", text: "Done, see the card.", ...saved }] },
    }),
  );
  await page.route(`${ANALYST}/chat`, (route) => {
    const allow = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: allow });
    return route.fulfill({ status: 200, headers: { ...allow, "content-type": "text/event-stream" }, body: sse(events) });
  });
}

const seedDeck = (page: Page) =>
  page.addInitScript(
    ([id, deck]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA] as const,
  );

const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
};

const ask = async (page: Page, text: string) => {
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const box = page.getByRole("textbox", { name: "Message Log Pose" });
  await box.fill(text);
  await box.press("Enter");
};

test("applies the edit Log Pose was asked to make by itself, once, and Undo sticks (#726)", async ({ page }, info) => {
  await seedDeck(page);
  await fakeLogPose(page, [["thread", { thread_id: 1 }], ["text", { delta: "Making that change to your deck now." }], ["proposal", edit], ["done", { thread_id: 1, cost_usd: 0.01, spent_today_usd: 0.01, daily_cap_usd: 3 }]], // The saved thread holds another id, as if the edit were made on another device: only a live edit applies by itself.
    { proposals: [{ ...edit, id: "toolu_saved_edit" }] });
  await page.goto(`/decks/${DECK_ID}/configure`);
  const stack = (id: string) => page.locator("article.deck-stack", { hasText: id });
  await expect(stack("ST01-010")).toHaveCount(0);

  await ask(page, "Swap two Chopper for two Franky");
  const card = page.locator(".lp-panel").getByRole("region", { name: "Edit by Log Pose for Red Vanilla" });
  // No Apply press: the deck editor behind the panel already holds the change.
  await expect(card.getByText("✓ Applied by Log Pose")).toBeVisible();
  await expect(stack("ST01-010").getByLabel("2 copies")).toBeVisible();
  await expect(stack("ST01-006").getByLabel("2 copies")).toBeVisible();
  await shot(page, `${info.project.name}-build-applied`);

  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await expect(stack("ST01-010")).toHaveCount(0);
  // It stays undone: nothing applies it again.
  await page.waitForTimeout(500);
  await expect(card.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await expect(stack("ST01-010")).toHaveCount(0);

  // After a reload the same edit comes back from the saved thread and waits for the player.
  await page.reload();
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const again = page.locator(".lp-panel").getByRole("region", { name: "Edit by Log Pose for Red Vanilla" });
  await expect(again.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(stack("ST01-010")).toHaveCount(0);
});

test("opens the create-deck page with Log Pose's deck filled in, once, and the card opens it again (#726)", async ({ page }, info) => {
  await seedDeck(page);
  await fakeLogPose(page, [["thread", { thread_id: 1 }], ["text", { delta: "I've opened the deck builder with the list filled in." }], ["deck_draft", draft], ["done", { thread_id: 1, cost_usd: 0.01, spent_today_usd: 0.01, daily_cap_usd: 3 }]], { drafts: [{ ...draft, id: "toolu_saved_draft" }] });
  await page.goto("/decks");
  await ask(page, "Build me a plain red deck");

  await expect(page).toHaveURL(/\/decks\/new$/);
  await expect(page.locator("#new-deck-name")).toHaveValue("Log Pose Red");
  await expect(page.locator("#deck-import-text")).toHaveValue("1xST01-001\n4xST01-003\n4xST01-006\n4xST01-008");
  await expect(page.getByText("Filled in by Log Pose")).toBeVisible();
  const phone = info.project.name === "phone-375";
  const panel = page.locator(".lp-panel");
  // Phones: the sheet gets out of the way so the page is visible; desktops keep the panel open.
  if (phone) await expect(panel).toHaveCount(0);
  else await expect(panel).toBeVisible();
  // No sideways scroll or clipped form at this width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, `${info.project.name}-build-create-page`);

  // Back at the deck list, the card (reopened from the panel) goes to the create page again with the list filled in.
  await page.goto("/decks");
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const card = panel.getByRole("region", { name: "New deck Log Pose Red" });
  await expect(card).toBeVisible();
  // A reloaded draft never opens by itself.
  await expect(page).toHaveURL(/\/decks$/);
  await card.locator("summary", { hasText: "12 cards" }).click();
  await expect(card.getByText("Nico Robin")).toBeVisible();
  await shot(page, `${info.project.name}-build-card`);
  await card.getByRole("button", { name: "Open in deck builder" }).click();
  await expect(page).toHaveURL(/\/decks\/new$/);
  await expect(page.locator("#new-deck-name")).toHaveValue("Log Pose Red");

  // On a phone the sheet closed again, so the form is in view; Create saves the deck with Log Pose's list.
  if (phone) await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Create deck from list" }).click();
  await expect(page).toHaveURL(/\/decks\/[^/]+\/configure$/);
  await expect(page.locator("article.deck-stack", { hasText: "ST01-008" }).getByLabel("4 copies")).toBeVisible();
});
