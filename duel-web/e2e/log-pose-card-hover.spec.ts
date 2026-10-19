/**
 * A card Log Pose names in its answer shows the card (#533): a mouse hovers the number or name, a finger taps it.
 * The two Log Pose services are faked in the browser (the planner API's chat session and the analyst's /brief
 * stream, which writes an answer naming OP01-006 by number and by name and citing it); the panel, the board and
 * the card pictures (/cards/*.png) are the real ones.
 *
 * LP_HOVER_SHOTS=<dir> also saves a screenshot of each state there.
 */
import { readFileSync } from "node:fs";
import { test, expect, FAKE_API, type Page } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const SHOTS = process.env.LP_HOVER_SHOTS;
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

const ANSWER = "Lead with OP01-006 on turn two. Otama gives -2000 power, so the bigger body stays home.";

const CARD_ART = readFileSync(new URL("../public/cards/ST01-001.png", import.meta.url));

async function stubLogPose(page: Page) {
  // The card's picture comes from TCGplayer's CDN; the run has no network, so a local scan stands in for it.
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

/** Where a paragraph sits in its own scroller and how big it is: a tap that scrolls the panel is not the text moving. */
const place = (el: ReturnType<Page["locator"]>) => el.evaluate((n: HTMLElement) => ({ top: n.offsetTop, left: n.offsetLeft, w: n.offsetWidth, h: n.offsetHeight }));

/** A practice board with Log Pose's brief written and open. */
async function briefOnBoard(page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void> }, opensItself: boolean) {
  await stubLogPose(page);
  await duel.startPractice({ seed: 11 });
  const panel = page.getByRole("dialog", { name: /Log Pose/ });
  if (!opensItself) await page.getByRole("button", { name: "Matchup brief", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate((el) => el.getAnimations().length)).toBe(0);
  await panel.getByRole("button", { name: "Get brief" }).click();
  await expect(panel).toContainText("bigger body stays home");
  return panel;
}

/** The picture is up, whole on screen, about 240px wide (less on a small screen), and above the panel. */
async function expectPeek(page: Page, panel: ReturnType<Page["locator"]>) {
  const peek = page.locator(".lp-peek");
  await expect(peek).toHaveCount(1);
  const img = peek.locator("img");
  await expect(img).toHaveAttribute("src", /product\/454518/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const box = (await peek.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.width).toBeGreaterThanOrEqual(Math.min(240, vp.width - 16, (vp.height - 16) / 1.4) - 2);
  expect(box.width).toBeLessThanOrEqual(241);
  // Sits above the panel it floats over, and never takes the pointer.
  const z = (el: ReturnType<Page["locator"]>) => el.evaluate((n) => Number(getComputedStyle(n).zIndex));
  expect(await z(peek)).toBeGreaterThan(await z(panel));
  expect(await peek.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe("none");
  return peek;
}

test("a card number or name in a Log Pose answer shows the card while the mouse is over it (#533)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "a mouse: the desktop project");
  const panel = await briefOnBoard(page, duel, true);
  const number = panel.getByRole("button", { name: "OP01-006: show card" });
  const name = panel.getByRole("button", { name: "Otama: show card" });
  await expect(page.locator(".lp-peek")).toHaveCount(0);

  const para = panel.locator("p", { hasText: "bigger body stays home" });
  const before = await place(para);
  await number.hover();
  const peek = await expectPeek(page, panel);
  // Nothing under the text moved.
  expect(await place(para)).toEqual(before);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-hover-number.png` });

  await page.mouse.move(5, 5);
  await expect(peek).toHaveCount(0);

  await name.hover();
  await expectPeek(page, panel);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-hover-name.png` });
  await page.mouse.move(5, 5);
  await expect(page.locator(".lp-peek")).toHaveCount(0);

  // The keyboard gets it too, and Escape puts it away without closing the panel.
  await number.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(number).toBeFocused();
  await expectPeek(page, panel);
  await page.keyboard.press("Escape");
  await expect(page.locator(".lp-peek")).toHaveCount(0);
  await expect(panel).toBeVisible();
});

for (const kind of ["portrait", "landscape"] as const) {
  test.describe(`${kind} phone`, () => {
    test.use({ viewport: kind === "portrait" ? { width: 375, height: 812 } : { width: 812, height: 375 }, hasTouch: true });

    test(`tapping a card number in a Log Pose answer toggles the card, in ${kind} (#533)`, async ({ page, duel }, info) => {
      test.skip(info.project.name !== "desktop-1280", "one run is enough: the viewport is set here");
      const panel = await briefOnBoard(page, duel, false);
      const number = panel.getByRole("button", { name: "OP01-006: show card" });
      const para = panel.locator("p", { hasText: "bigger body stays home" });
      const before = await place(para);

      await number.tap();
      await expectPeek(page, panel);
      expect(await place(para)).toEqual(before);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-${kind}-tap.png` });

      // A second tap puts it away; a tap elsewhere does too.
      await number.tap();
      await expect(page.locator(".lp-peek")).toHaveCount(0);
      await number.tap();
      await expect(page.locator(".lp-peek")).toHaveCount(1);
      await panel.locator("#lp-title").tap();
      await expect(page.locator(".lp-peek")).toHaveCount(0);

      // Escape closes the picture first and leaves the panel.
      await number.tap();
      await expect(page.locator(".lp-peek")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(page.locator(".lp-peek")).toHaveCount(0);
      await expect(panel).toBeVisible();
    });
  });
}
