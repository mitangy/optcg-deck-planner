/**
 * The lobby's deck switcher on the shared Headless UI Listbox, and Log Pose's source popover on the shared Popover
 * (#718): each opens fully on screen next to its trigger at every phone and desktop size without moving it or the
 * page, keys work inside (arrows, Enter, type-ahead, Escape with focus back), and a tap outside closes it.
 * The viewports are set here, so each spec runs once (in the desktop project).
 */
import { readFileSync } from "node:fs";
import { test, expect, FAKE_API, RED_VANILLA, type Page } from "./fixtures";

const SIZES = [
  { name: "phone portrait", width: 375, height: 812 },
  { name: "phone landscape", width: 812, height: 375 },
  { name: "desktop", width: 1280, height: 720 },
];

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const scrollHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

function expectOnScreen(b: { x: number; y: number; width: number; height: number }, vp: { width: number; height: number }, what: string) {
  expect(b.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(b.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${what} right`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.y + b.height, `${what} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
}

async function openLobby(page: Page, size: (typeof SIZES)[number]) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  const decks = [
    { id: "e2e-you", name: "Alpha deck", ...RED_VANILLA, updatedAt: 3 },
    { id: "e2e-b", name: "Bravo deck", ...RED_VANILLA, updatedAt: 2 },
    { id: "e2e-c", name: "Charlie deck", ...RED_VANILLA, updatedAt: 1 },
  ];
  await page.addInitScript((d) => {
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, decks);
  await page.goto("/");
  await expect(page.locator(".home-deck")).toBeVisible();
  // The lobby settles (art, intro strip) in a few frames.
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test(`the deck list opens on screen under the trigger and moves nothing, ${size.name} (#718)`, async ({ page }) => {
    await openLobby(page, size);
    const trigger = page.locator(".home-deck");
    const edit = page.locator(".home-deck-edit");
    const before = { trigger: await box(page, ".home-deck"), edit: await box(page, ".home-deck-edit"), height: await scrollHeight(page) };
    await trigger.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    // A click leaves no focus ring on the trigger (Headless UI focuses it from script, which Chrome counts as the keyboard).
    await expect(trigger).toHaveCSS("box-shadow", "none");
    expectOnScreen((await list.boundingBox())!, size, "list");
    expect(await box(page, ".home-deck")).toEqual(before.trigger);
    expect(await box(page, ".home-deck-edit")).toEqual(before.edit);
    expect(await scrollHeight(page), "the page grew").toBe(before.height);
    // Not over its own trigger, and as wide as the trigger.
    const l = (await list.boundingBox())!;
    const t = before.trigger;
    expect(l.y >= t.y + t.height - 1 || l.y + l.height <= t.y + 1, "the list covers its trigger").toBe(true);
    expect(Math.abs(l.width - t.width)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // The footer buttons are on screen too (the list scrolls, they do not).
    await expect(page.getByRole("option", { name: "+ New deck" })).toBeInViewport({ ratio: 1 });

    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await box(page, ".home-deck")).toEqual(before.trigger);
    expect(await scrollHeight(page)).toBe(before.height);
    void edit;
  });
}

test("arrow keys, Enter and type-ahead pick a deck in the list and Escape hands focus back (#718)", async ({ page }) => {
  await openLobby(page, SIZES[2]!);
  const trigger = page.locator(".home-deck");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const active = () => list.evaluate((el) => document.getElementById(el.getAttribute("aria-activedescendant") ?? "")?.querySelector(".deck-menu-name, .btn")?.textContent ?? "");
  expect(await active()).toBe("Alpha deck");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("Charlie deck");
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Opened and closed with the keyboard, the trigger shows its focus ring.
  await expect(trigger).not.toHaveCSS("box-shadow", "none");
  await expect(page.locator(".home-deck-name")).toHaveText("Charlie deck");

  // Typing the start of a name jumps to it.
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.type("bra");
  expect(await active()).toBe("Bravo deck");
  await page.keyboard.press("Enter");
  await expect(page.locator(".home-deck-name")).toHaveText("Bravo deck");

  // Escape leaves the choice alone.
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator(".home-deck-name")).toHaveText("Bravo deck");

  // A deck's Edit button takes a tap; Enter on the footer's New deck goes to the editor.
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/decks\/new$/);
});

test("a tap outside closes the deck list, and Edit on a row opens that deck (#718)", async ({ page }) => {
  await openLobby(page, SIZES[0]!);
  await page.locator(".home-deck").click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await page.mouse.click(page.viewportSize()!.width / 2, page.viewportSize()!.height - 3);
  await expect(list).toHaveCount(0);

  await page.locator(".home-deck").click();
  await page.getByRole("button", { name: "Edit Bravo deck" }).click();
  await expect(page).toHaveURL(/\/decks\/e2e-b\/configure$/);
});

// ——— Log Pose source popover ———

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
const ANSWER = "Lead with OP01-006 on turn two. Otama gives -2000 power, so the bigger body stays home.";
const CARD_ART = readFileSync(new URL("../public/cards/ST01-001.png", import.meta.url));

async function stubLogPose(page: Page) {
  await page.route("https://tcgplayer-cdn.tcgplayer.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: CARD_ART }));
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
    }),
  );
  await page.route(`${ANALYST}/**`, (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? "{}") as { generate: boolean };
    const headers = { ...CORS, "content-type": "text/event-stream" };
    if (!body.generate) return route.fulfill({ status: 200, headers, body: sse([["done", { cached: false }]]) });
    return route.fulfill({
      status: 200,
      headers,
      body: sse([
        ["text", { delta: ANSWER }],
        ["cite", { citations: [{ source: "card:OP01-006", title: "Otama (OP01-006)", cited_text: "[On Play] Give up to 1 of your opponent's Characters -2000 power." }] }],
        ["done", { cached: false, cost_usd: 0.1, saved: true }],
      ]),
    });
  });
}

for (const size of SIZES) {
  test(`a source marker opens its popover on screen without moving the answer, Escape closes only the popover, ${size.name} (#718)`, async ({ page, duel }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await stubLogPose(page);
    await duel.startPractice({ seed: 11 });
    const panel = page.getByRole("dialog", { name: /Log Pose/ });
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Matchup brief", exact: true }).click();
    await expect(panel).toBeVisible();
    await expect.poll(() => panel.evaluate((el) => el.getAnimations().length)).toBe(0);
    await panel.getByRole("button", { name: "Get brief" }).click();
    await expect(panel).toContainText("bigger body stays home");

    const marker = panel.getByRole("button", { name: /^Source 1/ });
    const para = panel.locator("p", { hasText: "bigger body stays home" });
    const place = (el: ReturnType<Page["locator"]>) => el.evaluate((n: HTMLElement) => ({ top: n.offsetTop, left: n.offsetLeft, w: n.offsetWidth, h: n.offsetHeight }));
    const before = { para: await place(para), marker: await marker.boundingBox() };
    await marker.click();
    const pop = page.getByRole("dialog", { name: /^Source 1/ });
    await expect(pop).toBeVisible();
    // A click leaves no focus ring on the marker (Headless UI focuses it from script, which Chrome counts as the keyboard).
    await expect(marker).toHaveCSS("outline-style", "none");
    expectOnScreen((await pop.boundingBox())!, size, "popover");
    expect(await place(para)).toEqual(before.para);
    expect(await marker.boundingBox()).toEqual(before.marker);
    await expect(pop).toContainText("-2000 power");

    // Escape puts away the popover, not the panel behind it, and focus goes back to the marker.
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(marker).toBeFocused();
    // Closed with the keyboard, the marker shows its focus ring.
    await expect(marker).toHaveCSS("outline-style", "solid");

    // A tap on the panel's title closes it too; the close button also works.
    await marker.click();
    await expect(pop).toBeVisible();
    await panel.locator("#lp-title").click();
    await expect(pop).toHaveCount(0);
    await marker.click();
    await pop.getByRole("button", { name: "Close source" }).click();
    await expect(pop).toHaveCount(0);
    await expect(panel).toBeVisible();
  });
}
