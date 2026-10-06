// Screenshots for #348: node scripts/card-preview-shots.mjs (dev server on :5174).
import { chromium } from "@playwright/test";
const OUT = "/mnt/project-files/card-preview-style";
const base = "http://127.0.0.1:5174";
const browser = await chromium.launch();

async function open(w, h, settings, path = "/demo") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(base + path);
  await page.waitForTimeout(1200);
  return page;
}

async function hoverLongest(page, known) {
  if (known) { await page.locator(`[data-instance-id="${known}"]`).first().hover(); await page.waitForTimeout(300); return known; }
  const ids = [];
  let best = null, bestLen = -1;
  for (const id of ids) {
    const el = page.locator(`[data-instance-id="${id}"]`).first();
    try { await el.hover({ timeout: 1000 }); } catch { continue; }
    const len = await page.locator(".card-preview-effect").evaluate((e) => e.textContent.length).catch(() => 0);
    if (len > bestLen) { bestLen = len; best = id; }
  }
  await page.locator(`[data-instance-id="${best}"]`).first().hover();
  await page.waitForTimeout(300);
  return best;
}

for (const [w, h] of [[1280, 720], [1440, 900]]) {
  for (const mode of ["compact", "big"]) {
    const modes = mode === "compact" && w === 1440 ? ["dark", "light"] : ["dark"];
    for (const cm of modes) {
      const page = await open(w, h, { previewBigCard: mode === "big", ...(cm === "light" ? { colorMode: "light" } : {}) });
      const id = await hoverLongest(page, "y-stage");
      await page.screenshot({ path: `${OUT}/desktop-${w}x${h}-${mode}${cm === "light" ? "-light" : ""}.png` });
      console.log(w, mode, cm, id);
      await page.context().close();
    }
  }
}
for (const [w, h] of [[1280, 720], [1440, 900]]) {
  const page = await open(w, h, {}, "/settings");
  await page.getByLabel("Big card preview").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/settings-desktop-${w}x${h}.png` });
  await page.context().close();
}
for (const [w, h, n] of [[375, 812, "phone-portrait"], [812, 375, "phone-landscape"]]) {
  let page = await open(w, h, {});
  await page.screenshot({ path: `${OUT}/${n}-board.png` });
  await page.context().close();
  page = await open(w, h, {}, "/settings");
  await page.getByLabel("Gray out unplayable cards").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${n}-settings.png` });
  console.log(n, "switch count", await page.getByLabel("Big card preview").count());
  await page.context().close();
}
await browser.close();
