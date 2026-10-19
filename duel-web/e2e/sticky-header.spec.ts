/**
 * Every page's header (menu, back link, title) stays at the top of the window while the page
 * scrolls (#510). The FastAPI backend is faked as a signed-out guest.
 */
import { test, expect, type Page } from "@playwright/test";
import { FAKE_API, RED_VANILLA } from "./fixtures";

async function open(page: Page, path: string): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/health") return route.fulfill({ json: { ok: true } });
    if (p === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }]);
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
}

/** The sticky bar around the menu button (the header, or just its nav row on phones), measured now. */
const stuckBar = (page: Page) =>
  page.getByRole("button", { name: "Menu" }).evaluate((btn) => {
    for (let el = btn.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      // The bar paints through a ::before so it can run past the column; its width is what spans the window.
      const bg = getComputedStyle(el, "::before");
      return {
        top: r.top,
        bottom: r.bottom,
        paintLeft: r.left + r.width / 2 - parseFloat(bg.width) / 2,
        paintWidth: parseFloat(bg.width),
        clientWidth: document.documentElement.clientWidth,
      };
    }
    return null;
  });

async function scrollSettled(page: Page, y: number): Promise<void> {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  let last = -1;
  await expect
    .poll(async () => {
      await page.waitForTimeout(100);
      const now = await page.evaluate(() => window.scrollY);
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page scrolls sideways").toBeLessThanOrEqual(0);
}

for (const path of ["/settings", "/whats-new", "/decks/e2e-you/configure"]) {
  test(`page header stays at the top while scrolling on ${path} (#510)`, async ({ page }) => {
    await open(page, path);
    const button = page.getByRole("button", { name: "Menu" });
    const rest = (await button.boundingBox())!;
    expect((await page.evaluate(() => document.documentElement.scrollHeight)) > page.viewportSize()!.height + 400, "page is long enough to scroll").toBe(true);

    await scrollSettled(page, 400);
    const bar = (await stuckBar(page))!;
    expect(bar, "the header is sticky").not.toBeNull();
    expect(bar.top, "bar sits at the top of the window").toBeCloseTo(0, 0);
    // The menu button is on screen, clear of the top edge, and still works.
    const now = (await button.boundingBox())!;
    expect(now.y).toBeGreaterThanOrEqual(0);
    expect(now.y).toBeLessThan(rest.y + 1);
    await button.click();
    await expect(page.getByRole("navigation", { name: "Site menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Site menu" })).toBeHidden();

    // Edge to edge: the painted bar covers the whole window, and nothing scrolls sideways.
    expect(bar.paintLeft).toBeLessThanOrEqual(0.5);
    expect(bar.paintWidth).toBeGreaterThanOrEqual(bar.clientWidth);
    await noSidewaysScroll(page);

    // Back at the top the header is where it always was.
    await scrollSettled(page, 0);
    expect(await button.boundingBox()).toEqual(rest);
  });
}

test("a Settings jump link lands a section below the header (#510)", async ({ page }) => {
  await open(page, "/settings");
  await page.getByRole("navigation", { name: "Jump to a section" }).getByRole("link", { name: "Appearance" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await scrollSettled(page, await page.evaluate(() => window.scrollY));
  const bar = (await stuckBar(page))!;
  const top = await page.evaluate(() => document.getElementById("appearance")!.getBoundingClientRect().top);
  expect(top, "the section is not hidden under the header").toBeGreaterThanOrEqual(bar.bottom);
  expect(top, "and sits right below it").toBeLessThan(bar.bottom + 40);
});

test("the deck editor's card search column stays below the header (#510)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "two columns need a wide window");
  await open(page, "/decks/e2e-you/configure");
  await scrollSettled(page, 200);
  const bar = (await stuckBar(page))!;
  const side = (await page.locator(".deck-editor-side").boundingBox())!;
  expect(side.y, "search column is not under the header").toBeGreaterThanOrEqual(bar.bottom);
});

for (const [name, size] of [
  ["a phone", { width: 375, height: 812 }],
  ["a phone on its side", { width: 812, height: 375 }],
] as const) {
  test(`the stuck Decks and deck editor headers leave most of the window free on ${name} (#510)`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const path of ["/decks", "/decks/e2e-you/configure"]) {
      await open(page, path);
      await scrollSettled(page, 400);
      const bar = (await stuckBar(page))!;
      expect(bar.top).toBeCloseTo(0, 0);
      expect(bar.bottom, `${path} header height`).toBeLessThanOrEqual(size.height / 4);
      await noSidewaysScroll(page);
    }
  });
}
