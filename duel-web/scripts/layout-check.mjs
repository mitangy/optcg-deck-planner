#!/usr/bin/env node
/**
 * Layout smoke check for the /demo board. Starts nothing: point it at a running
 * server (`vite preview`), and it screenshots the page at desktop and phone
 * sizes and fails (exit 1) on sideways scroll, page errors, or a squeezed
 * playmat card.
 *
 *   node scripts/layout-check.mjs [baseUrl] [outDir]
 *
 * baseUrl defaults to http://localhost:4173, outDir to layout-shots.
 * PW_CHROMIUM_PATH points Playwright at a specific Chromium binary.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const outDir = process.argv[3] ?? "layout-shots";

/** minCard: narrowest allowed `.side-field.side-you [data-instance-id]` (CSS px). */
const VIEWPORTS = [
  { name: "desktop-1280x720", width: 1280, height: 720, minCard: 40 },
  { name: "desktop-1920x1080", width: 1920, height: 1080, minCard: 40 },
  { name: "zoom150-960x600", width: 960, height: 600, minCard: 40 },
  { name: "phone-375x812", width: 375, height: 812, minCard: 30 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const failures = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/demo`, { waitUntil: "networkidle" });
  await page.waitForSelector(".side-field.side-you [data-instance-id]", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    cardWidths: [...document.querySelectorAll(".side-field.side-you [data-instance-id]")].map(
      (el) => el.getBoundingClientRect().width,
    ),
  }));
  await page.screenshot({ path: join(outDir, `${vp.name}.png`) });

  const problems = [];
  if (m.scrollWidth > m.innerWidth) {
    problems.push(`horizontal scroll (scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth})`);
  }
  for (const e of errors) problems.push(`page error: ${e}`);
  if (m.cardWidths.length === 0) {
    problems.push("no .side-field.side-you [data-instance-id] cards found");
  } else {
    const narrowest = Math.min(...m.cardWidths);
    if (narrowest < vp.minCard) {
      problems.push(`playmat card ${narrowest.toFixed(1)}px wide, floor ${vp.minCard}px`);
    }
  }
  const narrow = m.cardWidths.length ? `${Math.min(...m.cardWidths).toFixed(0)}px` : "n/a";
  console.log(
    `${problems.length ? "FAIL" : "ok  "} ${vp.name} (narrowest card ${narrow})${problems.length ? ": " + problems.join("; ") : ""}`,
  );
  for (const p of problems) failures.push(`${vp.name}: ${p}`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} layout problem(s)`);
  process.exit(1);
}
