#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const outDir = process.argv[3] ?? "layout-shots";

const VIEWPORTS = [
  { name: "desktop-1280x720", width: 1280, height: 720, minCard: 40 },
  { name: "desktop-1920x1080", width: 1920, height: 1080, minCard: 40 },
  { name: "zoom150-960x600", width: 960, height: 600, minCard: 40 },
  { name: "phone-375x812", width: 375, height: 812, minCard: 30, phone: true },
  { name: "phone-landscape-812x375", width: 812, height: 375, minCard: 30, phone: true },
];

function overflowOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
  }, selector);
}

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
  const primarySpill = await overflowOf(page, ".intent-btn-primary");
  if (primarySpill > 1) problems.push(`primary button label spills ${primarySpill}px past the button`);
  if (vp.phone) {
    await page.goto(`${baseUrl}/demo?box&prompt=satori`, { waitUntil: "networkidle" });
    await page.waitForSelector(".choice-prompt .order-row", { timeout: 15000 }).catch(() => {});
    const promptSpill = await overflowOf(page, ".choice-prompt");
    if (promptSpill > 1) problems.push(`deck-order prompt ${promptSpill}px wider than itself`);
    await page.screenshot({ path: join(outDir, `${vp.name}-deck-order.png`) });

    await page.goto(`${baseUrl}/demo?turn0`, { waitUntil: "networkidle" });
    await page.waitForSelector(".mulligan-hand-actions .intent-btn", { timeout: 15000 }).catch(() => {});
    const mull = await page.evaluate(() => {
      const bar = document.querySelector(".mulligan-hand-actions");
      if (!bar) return null;
      const edge = bar.getBoundingClientRect().right;
      const buttons = [...bar.querySelectorAll(".intent-btn")];
      return {
        buttons: buttons.length,
        past: Math.max(0, ...buttons.map((b) => b.getBoundingClientRect().right - edge)),
        spill: Math.max(0, ...buttons.map((b) => b.scrollWidth - b.clientWidth)),
      };
    });
    if (!mull || mull.buttons < 2) problems.push("mulligan buttons not found on /demo?turn0");
    else {
      if (mull.past > 1) problems.push(`mulligan button runs ${Math.round(mull.past)}px past the opening hand card`);
      if (mull.spill > 1) problems.push(`mulligan button label spills ${mull.spill}px past the button`);
    }
    await page.screenshot({ path: join(outDir, `${vp.name}-mulligan.png`) });
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
