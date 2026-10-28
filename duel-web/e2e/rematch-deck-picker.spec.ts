/**
 * The game-over "Deck for the rematch" picker (#772). It was a native select whose open list Windows Chrome / Edge
 * painted light gray with near-invisible light text. It is now the shared Select (Headless UI Listbox): an opaque
 * list in the theme's panel colour, floating over the game-over overlay without moving the panel. Every other
 * dropdown in the app uses the same Select (#797). Driven by `/demo?over`, whose rematch panel offers two saved
 * decks. Runs once, on desktop, and sets its own viewports.
 */
import { test, expect, type Page } from "./fixtures";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

const SIZES = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone portrait", width: 375, height: 812 },
  { name: "phone landscape", width: 812, height: 375 },
];

type Rgba = { r: number; g: number; b: number; a: number };

/** Resolve a CSS colour (any syntax the browser accepts) to rgba by painting it on a canvas-free probe. */
async function colour(page: Page, css: string): Promise<Rgba> {
  return page.evaluate((c) => {
    const el = document.createElement("span");
    el.style.color = c;
    document.body.append(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
    el.remove();
    return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 };
  }, css);
}

const parse = (s: string): Rgba => {
  const m = s.match(/[\d.]+/g)!.map(Number);
  return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 };
};

const lum = ({ r, g, b }: Rgba) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: Rgba, b: Rgba) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

async function openOver(page: Page, size: (typeof SIZES)[number], settings: Record<string, string> = {}) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?over");
  await page.locator(".rematch-deck .ui-select-button").waitFor();
  await page.waitForTimeout(300);
}

for (const size of SIZES) {
  test(`the rematch deck list is an opaque themed list above the game-over panel and moves nothing, ${size.name} (#772)`, async ({ page }) => {
    await openOver(page, size);
    const trigger = page.locator(".rematch-deck .ui-select-button");
    const panel = page.locator(".rematch-panel");
    const before = { trigger: await trigger.boundingBox(), panel: await panel.boundingBox() };
    await trigger.click();
    const list = page.locator(".ui-select-list");
    await expect(list).toBeVisible();

    // Opaque, and the theme's panel colour (not the browser's gray / white).
    const panelBg = await colour(page, "var(--arena-panel)");
    const listBg = parse(await list.evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(listBg.a).toBe(1);
    expect(listBg).toEqual(panelBg);

    // Text reads on it: the deck name and the muted sub-line.
    const name = page.locator(".ui-select-option .ui-select-label").nth(1);
    const sub = page.locator(".ui-select-option .ui-select-sub").first();
    expect(contrast(parse(await name.evaluate((el) => getComputedStyle(el).color)), listBg)).toBeGreaterThan(4.5);
    expect(contrast(parse(await sub.evaluate((el) => getComputedStyle(el).color)), listBg)).toBeGreaterThan(3);

    // Opening moves neither the trigger nor the panel; the list sits on screen, under the trigger's width at least.
    expect(await trigger.boundingBox()).toEqual(before.trigger);
    expect(await panel.boundingBox()).toEqual(before.panel);
    const lb = (await list.boundingBox())!;
    expect(lb.x).toBeGreaterThanOrEqual(0);
    expect(lb.y).toBeGreaterThanOrEqual(0);
    expect(lb.x + lb.width).toBeLessThanOrEqual(size.width + 0.5);
    expect(lb.y + lb.height).toBeLessThanOrEqual(size.height + 0.5);
    expect(lb.width).toBeGreaterThanOrEqual(before.trigger!.width - 1);

    // It is above the game-over overlay: what paints at the row's centre is the row, so a click lands.
    const row = page.locator(".ui-select-option").nth(2);
    const rb = (await row.boundingBox())!;
    const top = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest(".ui-select-option") !== null,
      [rb.x + rb.width / 2, rb.y + rb.height / 2],
    );
    expect(top).toBe(true);

    // Picking a deck closes the list, updates the trigger and keeps its size.
    await row.click();
    await expect(list).toBeHidden();
    await expect(trigger).toContainText("Straw Hat Midrange with a Very Long Deck Name");
    expect(await trigger.boundingBox()).toEqual(before.trigger);
    expect(await panel.boundingBox()).toEqual(before.panel);
  });
}

test("the rematch deck list stays themed and readable in a crew theme and in light mode (#772)", async ({ page }) => {
  for (const settings of [{ theme: "wano" }, { theme: "heart", colorMode: "light" }] as { theme: string; colorMode?: string }[]) {
    await openOver(page, SIZES[0]!, settings);
    await expect(page.locator("html")).toHaveAttribute("data-theme", settings.theme);
    if (settings.colorMode) await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
    await page.locator(".rematch-deck .ui-select-button").click();
    const list = page.locator(".ui-select-list");
    await expect(list).toBeVisible();
    const bg = parse(await list.evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(bg).toEqual(await colour(page, "var(--arena-panel)"));
    const name = page.locator(".ui-select-option .ui-select-label").first();
    expect(contrast(parse(await name.evaluate((el) => getComputedStyle(el).color)), bg)).toBeGreaterThan(4.5);
    await page.keyboard.press("Escape");
  }
});

test("the keyboard picks a deck and the label names the button (#772)", async ({ page }) => {
  await openOver(page, SIZES[0]!);
  const trigger = page.locator(".rematch-deck .ui-select-button");
  await expect(page.getByRole("button", { name: /Deck for the rematch/ })).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".ui-select-list")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Zoro Aggro");
});

test("a settings dropdown opens the same opaque themed list instead of the browser's gray list (#797)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/settings");
  expect(await page.locator("select").count()).toBe(0);
  const trigger = page.locator(".field .ui-select-button").first();
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // the settings page finishes its own layout first
  const before = await trigger.boundingBox();
  await trigger.click();
  const list = page.locator(".ui-select-list");
  await expect(list).toBeVisible();
  const bg = parse(await list.evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(bg.a).toBe(1);
  expect(bg).toEqual(await colour(page, "var(--arena-panel)"));
  const option = page.locator(".ui-select-option .ui-select-label").first();
  expect(contrast(parse(await option.evaluate((el) => getComputedStyle(el).color)), bg)).toBeGreaterThan(4.5);
  expect(await trigger.boundingBox()).toEqual(before);
});
