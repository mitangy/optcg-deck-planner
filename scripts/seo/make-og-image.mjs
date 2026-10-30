// Renders the 1200x630 link-preview cards (duel-web/public/og-image.png and frontend/public/og-image.png).
//   node scripts/seo/make-og-image.mjs
// Needs Playwright with a Chromium (set CHROMIUM_PATH to use a specific binary). Re-run after changing the copy below.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(root, "duel-web/package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire(resolve(root, "frontend/package.json"))("@playwright/test"));
}

const CARDS = [
  {
    out: "duel-web/public/og-image.png",
    icon: "duel-web/public/icons/icon-512.png",
    bg: "#0b1720",
    glow: "#1f4a5c",
    gold: "#e2b458",
    ink: "#f1e9d6",
    muted: "#95a4ad",
    name: "OPTCG Duel",
    tagline: "Play OPTCG online",
    sub: "Free, unofficial fan sim in your browser.",
  },
  {
    out: "frontend/public/og-image.png",
    icon: "frontend/public/icons/icon-512.png",
    bg: "#16303b",
    glow: "#21485a",
    gold: "#e2b458",
    ink: "#ece3cf",
    muted: "#a3afb3",
    name: "OPTCG Deck Planner",
    tagline: "One Piece TCG deck builder",
    sub: "Unofficial fan project. Live TCGPlayer prices.",
  },
];

const html = (c, iconData) => `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 88px;display:flex;align-items:center;gap:64px;
  background:radial-gradient(ellipse at 20% 0%, ${c.glow} 0%, transparent 65%), ${c.bg};font-family:Georgia,'Times New Roman',serif;color:${c.ink}">
  <img src="${iconData}" width="260" height="260" style="border-radius:56px;flex:none">
  <div style="min-width:0">
    <div style="font-size:30px;letter-spacing:.18em;text-transform:uppercase;color:${c.gold};font-family:system-ui,sans-serif;font-weight:700">${c.name}</div>
    <div style="font-size:78px;line-height:1.08;font-weight:700;margin:22px 0 26px">${c.tagline}</div>
    <div style="font-size:34px;line-height:1.35;color:${c.muted};font-family:system-ui,sans-serif">${c.sub}</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const c of CARDS) {
    const icon = `data:image/png;base64,${readFileSync(resolve(root, c.icon)).toString("base64")}`;
    await page.setContent(html(c, icon));
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
    writeFileSync(resolve(root, c.out), png);
    console.log(c.out, `${Math.round(statSync(resolve(root, c.out)).size / 1024)} KB`);
  }
} finally {
  await browser.close();
}
