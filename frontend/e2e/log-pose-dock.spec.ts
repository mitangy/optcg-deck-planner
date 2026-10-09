/**
 * Log Pose docked to a side of the planner (#432): the page makes room for the strip, so the top bar and the
 * deck stay out from under it and nothing scrolls sideways; a phone keeps its bottom sheet whatever side was
 * remembered. LP_DOCK_SHOTS=<dir> also saves screenshots there.
 */
import { test, expect, DECK_ID } from "./fixtures";

const SHOTS = process.env.LP_DOCK_SHOTS;

/** Every top-bar link and button is whole beside the panel (not under it) and no link label runs onto a second line. */
async function expectNavFits(page: import("@playwright/test").Page, panelLeft: number) {
  const items = await page.locator(".topbar nav a, .topbar .user > *").evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ text: (e.textContent ?? "").trim(), right: e.getBoundingClientRect().right, h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 0 })),
  );
  expect(items.length).toBeGreaterThan(4);
  for (const i of items) expect(i.right, `${i.text} is clipped by the panel`).toBeLessThanOrEqual(panelLeft + 1);
  // Every label is on one line: its text has a single line box.
  const wrapped = await page.locator(".topbar nav a, .topbar .user > *").evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().width > 0 && ((): number => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((x) => Math.round(x.top / 6))).size; })() > 1).map((e) => (e.textContent ?? "").trim()),
  );
  expect(wrapped, "labels that wrap").toEqual([]);
}

test("a panel docked to the right gives the page its room, so the top bar and the deck stay left of it (#432)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "the phone keeps its sheet (next test)");
  planner.enableLogPose();
  await page.addInitScript(() => localStorage.setItem("optcg-logpose:dock", "right"));
  await planner.open(`/decks/${DECK_ID}`);
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Log Pose" });
  await expect(panel).toHaveAttribute("data-dock", "right");
  await expect.poll(() => panel.evaluate((el) => el.getAnimations().length)).toBe(0);

  const box = (await panel.boundingBox())!;
  expect(box.x + box.width).toBeCloseTo(1200, 0);
  expect(box.height).toBeCloseTo(900, 0);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBeCloseTo(box.width, 0);
  const bar = (await page.locator(".topbar").first().boundingBox())!;
  expect(bar.x).toBeCloseTo(0, 0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(box.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expectNavFits(page, box.x);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/08-planner-docked-1200.png` });
  // A wider window leaves more room beside the panel: still fits.
  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = (await panel.boundingBox())!;
  await expectNavFits(page, wide.x);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/08b-planner-docked-1440.png` });
  await page.setViewportSize({ width: 1200, height: 900 });

  // Closing gives the width back.
  await panel.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBe(0);
  const full = (await page.locator(".topbar").first().boundingBox())!;
  expect(full.width).toBeCloseTo(1200, 0);
});

test("a phone keeps the bottom sheet even when a side was remembered, and the page gets no extra room (#432)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "desktop is covered above");
  planner.enableLogPose();
  await page.addInitScript(() => localStorage.setItem("optcg-logpose:dock", "left"));
  await planner.open(`/decks/${DECK_ID}`);
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Log Pose" });
  await expect(panel).toHaveAttribute("data-phone", "true");
  await expect(panel).not.toHaveAttribute("data-dock", /.+/);
  await expect.poll(() => panel.evaluate((el) => el.getAnimations().length)).toBe(0);
  expect((await panel.boundingBox())!.width).toBeCloseTo(375, 0);
  expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBeUndefined();
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingLeft))).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/09-planner-phone-375.png` });
});
