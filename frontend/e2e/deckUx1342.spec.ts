import type { Locator, Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxAtViewportBottom(el: Locator) {
  await el.evaluate((node) => node.scrollIntoView({ block: "end" }));
  return (await el.boundingBox())!;
}

test("Stats does not float over the list search or the List/Grid switch in edit mode on a phone (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "the floating pill was a phone control");
  await planner.open(`/decks/${DECK_ID}?edit=1`);
  const stats = page.getByRole("button", { name: /^Deck stats/ });
  await expect(stats).toBeVisible();
  const listSearch = page.locator(".deck-toolbar").getByRole("searchbox");
  const viewSwitch = page.locator(".deck-toolbar").getByRole("group", { name: "Card layout" });
  for (const control of [listSearch, viewSwitch]) {
    const target = await boxAtViewportBottom(control);
    const statsBox = (await stats.boundingBox())!;
    expect(overlap(statsBox, target), "Stats overlaps a list control").toBe(false);
    expect(statsBox.width).toBeGreaterThanOrEqual(44);
    expect(statsBox.height).toBeGreaterThanOrEqual(44);
  }
  await stats.click();
  await expect(page.getByRole("dialog", { name: "Deck stats" })).toBeVisible();
});

test("Stats sits in the header, not in a fixed corner, on a phone (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "the floating pill was a phone control");
  await planner.open(`/decks/${DECK_ID}`);
  const stats = page.getByRole("button", { name: /^Deck stats/ });
  await expect(stats).toBeVisible();
  await expect(page.locator(".deck-head-actions").getByRole("button", { name: /^Deck stats/ })).toHaveCount(1);
  expect(await stats.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
});

async function openEdit(page: Page) {
  await page.getByRole("button", { name: "Edit deck" }).click();
}

test("While editing, the count column is headed In deck and holds the stepper (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the table is the desktop layout");
  await planner.open(`/decks/${DECK_ID}`);
  const headers = page.locator(".deck-table thead");
  await expect(headers).toContainText("To buy");
  await openEdit(page);
  await expect(headers).toContainText("In deck");
  await expect(headers).not.toContainText("To buy");
  const row = page.locator('.deck-table [data-card-id="EB01-002"]');
  await expect(row.getByRole("button", { name: "Increase EB01-002 in deck" })).toBeVisible();
  await expect(row.locator(".need-cell")).not.toContainText("of");
});

test("The edit toggle reads Done editing with a single space between the words (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the phone header shortens the label");
  await planner.open(`/decks/${DECK_ID}`);
  await openEdit(page);
  const toggle = page.getByRole("button", { name: "Done editing" });
  await expect(toggle).toBeVisible();
  const gap = await toggle.evaluate((el) => {
    const words = (node: Node, out: Range[] = []): Range[] => {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const m of (node.textContent ?? "").matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(node, m.index!);
          r.setEnd(node, m.index! + m[0].length);
          out.push(r);
        }
      }
      node.childNodes.forEach((c) => words(c, out));
      return out;
    };
    const rects = words(el).map((r) => r.getBoundingClientRect());
    return { gap: rects[1]!.left - rects[0]!.right, font: parseFloat(getComputedStyle(el).fontSize) };
  });
  expect(gap.gap).toBeLessThan(gap.font * 0.4);
});

test("On a wide, tall screen the stats stay visible under Add cards while editing (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "sets its own viewport");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await planner.open(`/decks/${DECK_ID}?edit=1`);
  const editor = page.getByRole("complementary", { name: "Add cards" });
  const stats = editor.getByRole("complementary", { name: "Deck stats" });
  await expect(stats).toBeVisible();
  const [e, s] = [(await editor.boundingBox())!, (await stats.boundingBox())!];
  expect(s.y).toBeGreaterThan(e.y);
  expect(s.y + s.height).toBeLessThanOrEqual(1080);
  await expect(page.getByRole("button", { name: /^Deck stats/ })).toHaveCount(0);
});

test("On a narrower desktop the stats open from the header Stats button while editing (#1342)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "sets its own viewport");
  await planner.open(`/decks/${DECK_ID}?edit=1`);
  const stats = page.locator(".deck-head-actions").getByRole("button", { name: /^Deck stats/ });
  await expect(stats).toBeVisible();
  await expect(page.locator(".stats-pill")).toHaveCount(0);
  await stats.click();
  await expect(page.getByRole("dialog", { name: "Deck stats" })).toBeVisible();
});

test("A single hint does not reserve a second row of space (#1342)", async ({ page, planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
  if (page.viewportSize()!.width < 1000) await page.getByRole("button", { name: /^Deck stats/ }).click();
  const tray = page.locator(".dh-tray:visible");
  await expect(tray.locator("[data-hint-id]").first()).toBeVisible();
  const { height, rem } = await tray.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));
  expect(height / rem).toBeLessThan(4.2);
});
