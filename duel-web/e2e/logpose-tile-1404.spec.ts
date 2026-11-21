import { test, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const LONG_NAME = "Teach OP18 Monkey D. Luffy Straw Hat Grand Fleet Ramp Midrange Control";

async function openHomeWithLogPose(page: Page, deckName: string) {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/live") return route.fulfill({ json: { online: 12, matches: 3 } });
    if (path === "/analyst/chat/session")
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
      });
    if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, headers: CORS, json: { detail: "not in e2e fake API" } });
  });
  await page.addInitScript(
    ({ decks }) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(decks));
      localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
    },
    { decks: [{ id: "e2e-you", name: deckName, ...RED_VANILLA, updatedAt: 1 }] },
  );
  await page.goto("/");
}

test.describe("Ask Log Pose tile (#1404)", () => {
  for (const size of [
    { name: "phone portrait", width: 375, height: 812 },
    { name: "desktop", width: 1280, height: 800 },
  ]) {
    test(`Ask Log Pose tile shows the deck name on one line with the description under it, ${size.name} (#1404)`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openHomeWithLogPose(page, LONG_NAME);
      const tile = page.locator(".logpose-tile");
      await expect(tile).toBeVisible();
      await expect(tile.locator(".logpose-tile-title")).toHaveText(`Ask Log Pose about ${LONG_NAME}`);

      const m = await tile.evaluate((el) => {
        const r = (s: string) => el.querySelector(s)!.getBoundingClientRect();
        const cs = (s: string) => getComputedStyle(el.querySelector(s)!);
        const title = el.querySelector(".logpose-tile-title") as HTMLElement;
        return {
          tile: el.getBoundingClientRect().toJSON(),
          title: r(".logpose-tile-title").toJSON(),
          sub: r(".logpose-tile-sub").toJSON(),
          glyph: r(".logpose-tile-glyph").toJSON(),
          titleLine: parseFloat(cs(".logpose-tile-title").lineHeight) || parseFloat(cs(".logpose-tile-title").fontSize) * 1.3,
          subLine: parseFloat(cs(".logpose-tile-sub").lineHeight) || parseFloat(cs(".logpose-tile-sub").fontSize) * 1.3,
          subSize: parseFloat(cs(".logpose-tile-sub").fontSize),
          glyphBorder: parseFloat(cs(".logpose-tile-glyph").borderTopWidth),
          glyphRadius: cs(".logpose-tile-glyph").borderTopLeftRadius,
          truncated: title.scrollWidth > title.clientWidth,
        };
      });

      expect(m.title.height).toBeLessThan(m.titleLine * 1.6);
      expect(m.sub.height).toBeLessThan(m.subLine * 1.6);
      expect(m.title.right).toBeLessThanOrEqual(m.tile.right);
      expect(m.sub.right).toBeLessThanOrEqual(m.tile.right);
      expect(m.sub.top).toBeGreaterThanOrEqual(m.title.bottom - 1);
      expect(m.glyph.right).toBeLessThanOrEqual(m.title.left + 1);
      expect(m.subSize).toBeGreaterThanOrEqual(12);
      expect(m.glyphBorder).toBeGreaterThan(0);
      expect(m.glyph.width).toBeCloseTo(m.glyph.height, 0);
      expect(parseFloat(m.glyphRadius)).toBeGreaterThanOrEqual(m.glyph.width / 2 - 1);
      // The deck name is long enough that it is cut with an ellipsis, and the full name stays readable on hover.
      expect(m.truncated).toBe(true);
      await expect(tile.locator(".logpose-tile-title")).toHaveAttribute("title", `Ask Log Pose about ${LONG_NAME}`);
    });
  }
});
