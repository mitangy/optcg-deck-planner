/**
 * The big turn heading sizes from its card, not the window (#774): with the right column dragged to its narrowest
 * (250px, the Turn panel's minimum) in a wide window, "OPPONENT'S TURN" used to be sized from the 1920px viewport
 * and spilled out of its bordered card. A column setting (panelSizes `R=250`), desktop only.
 */
import { test, expect, type Page } from "./fixtures";

test.use({ legacyLayout: false });

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const settings = { bigBoard: true, panelSizes: "R=250", panelSizesBig: "R=250" };
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(500);
}

/** How far the heading's text pokes out of the banner's content box (inside its border and padding), per side, and whether the banner scrolls. */
const fit = (page: Page) =>
  page.evaluate(() => {
    const banner = document.querySelector(".turn-banner")!;
    const title = document.querySelector(".turn-banner-title")!;
    const b = banner.getBoundingClientRect();
    const cs = getComputedStyle(banner);
    const inL = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const inR = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const range = document.createRange();
    range.selectNodeContents(title);
    const lines = [...range.getClientRects()];
    return {
      left: inL - Math.min(...lines.map((r) => r.left)),
      right: Math.max(...lines.map((r) => r.right)) - inR,
      scrolls: banner.scrollWidth - banner.clientWidth,
      column: document.querySelector(".arena-rail")!.getBoundingClientRect().width,
    };
  });

test.describe("desktop", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-1280", "desktop only");
  });

  test("turn heading fits its card at the narrowest side column (#774)", async ({ page }) => {
    await open(page, "?oppturn&wait=turn");
    await expect(page.locator(".turn-banner-title")).toHaveText("Opponent's turn");
    const f = await fit(page);
    expect(Math.round(f.column), "the column is at its narrowest").toBe(250);
    // The text stays inside the card's padding, with a few px to spare (it is 17px clear today).
    expect(f.left, "text left of the card").toBeLessThanOrEqual(-6);
    expect(f.right, "text right of the card").toBeLessThanOrEqual(-6);
    expect(f.scrolls, "the card scrolls sideways").toBeLessThanOrEqual(0);
    const title = await page.locator(".turn-banner-title").evaluate((el) => ({ over: el.scrollWidth - el.clientWidth, wrapsTo: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight) }));
    expect(title.over, "the heading's own text spills").toBeLessThanOrEqual(0);
    expect(Math.round(title.wrapsTo), "wraps to two lines at most").toBeLessThanOrEqual(2);
  });

  test("a long spectator name in the turn heading wraps inside the card at the narrowest column (#774)", async ({ page }) => {
    await open(page, "?oppturn&wait=turn");
    await page.locator(".turn-banner-title").evaluate((el) => (el.textContent = "Mikosaurusrexmegasaurus's turn"));
    const f = await fit(page);
    expect(f.left, "text left of the card").toBeLessThanOrEqual(0);
    expect(f.right, "text right of the card").toBeLessThanOrEqual(0);
    expect(f.scrolls, "the card scrolls sideways").toBeLessThanOrEqual(0);
  });
});
