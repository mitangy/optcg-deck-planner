/**
 * DON!! fanned out from under a Leader / Character slides under the cards
 * next to it, never over them (#1249): sideways within the Characters row
 * (standing and rested, both mats, Upright DON!! on or off) and down onto the
 * Leader row. The viewports are set here, so the spec runs once (in the
 * desktop project).
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop 1280x720", width: 1280, height: 720 },
  { name: "desktop 1920x1080", width: 1920, height: 1080 },
  { name: "phone portrait 375x812", width: 375, height: 812 },
  { name: "phone landscape 812x375", width: 812, height: 375 },
];

const BOARDS = [
  { name: "standing + rested Characters", url: "/demo?dons" },
  { name: "two rested Characters", url: "/demo?dons&rest=2" },
];

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

/** Points inside another card where one card's DON!! is the top thing painted. */
async function donOverNeighbors(page: Page) {
  // The layers ignore the pointer (pure decoration); let hit tests see them.
  await page.addStyleTag({ content: ".don-under, .don-under-layer { pointer-events: auto !important; }" });
  return page.evaluate(() => {
    const hits: string[] = [];
    const tiles = [...document.querySelectorAll<HTMLElement>(".board-root .side-field .card-tile")];
    for (const layer of document.querySelectorAll<HTMLElement>(".side-field .don-under-layer")) {
      const owner = layer.closest<HTMLElement>(".card-tile")!;
      const lr = layer.getBoundingClientRect();
      for (const t of tiles) {
        if (t === owner) continue;
        // Inset past the rounded corners, where nothing of the card is painted.
        const r = t.getBoundingClientRect();
        const x0 = Math.max(lr.left, r.left + 10);
        const x1 = Math.min(lr.right, r.right - 10);
        const y0 = Math.max(lr.top, r.top + 10);
        const y1 = Math.min(lr.bottom, r.bottom - 10);
        if (x1 - x0 < 2 || y1 - y0 < 2) continue;
        for (let i = 1; i < 6; i++) {
          for (let j = 1; j < 6; j++) {
            const el = document.elementFromPoint(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * j) / 6);
            if (el?.classList.contains("don-under-layer") && owner.contains(el)) {
              hits.push(`${owner.querySelector("img")?.alt} over ${t.querySelector("img")?.alt}`);
            }
          }
        }
      }
    }
    return [...new Set(hits)];
  });
}

for (const vp of VIEWPORTS) {
  for (const board of BOARDS) {
    for (const upright of [false, true]) {
      test(`DON!! goes under the cards next to it: ${board.name}, ${vp.name}${upright ? ", Upright DON!!" : ""} (#1249)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.addInitScript((u) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ donUpright: u })), upright);
        await page.goto(board.url);
        await page.locator(".board-root").waitFor();
        await expect(page.locator(".side-field .don-under-layer").first()).toBeAttached();
        // Rested tiles turn with a 180ms transition; let the board settle.
        await page.waitForTimeout(500);
        expect(await donOverNeighbors(page)).toEqual([]);
      });
    }
  }
}
