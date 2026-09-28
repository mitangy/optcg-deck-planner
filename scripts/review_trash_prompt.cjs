/* Run against duel-web Vite on :5174. Exercises the real prompt component. */
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { OnPlayPrompt } = await import('/src/board/OnPlayPrompt.tsx');
      const mount = document.createElement('main');
      document.body.replaceChildren(mount);
      mount.style.padding = '16px';
      const root = createRoot(mount);
      window.renderReview = (id) => {
        window.sentIntent = null;
        root.render(React.createElement(OnPlayPrompt, { key: id, view: { you: { hand: [] } }, choice: {
          id, seat: 0, kind: 'optional_ability', cardDefId: 'OP16-115', optional: true,
          abilityId: 'main_trash_trigger_to_hand', prompt: 'Black Vortex — choose a card from your trash.',
          trashOptions: [{ id: `${id}:a`, defId: 'OP12-112', eligible: true }, { id: `${id}:b`, defId: 'OP12-112', eligible: true }],
        }, onSend: (intent) => { window.sentIntent = intent; } }));
      };
    });
    fs.mkdirSync(path.resolve('artifacts'), { recursive: true });
    for (const width of [375, 1200]) {
      await page.setViewport({ width, height: 800 });
      await page.evaluate(() => window.renderReview('first'));
      await page.waitForSelector('.ability-chip');
      await page.waitForFunction(() => document.querySelectorAll('.ability-chip').length === 2);
      await page.$$eval('.ability-chip', (chips) => chips[0].click());
      await page.waitForFunction(() => document.querySelectorAll('.ability-chip.selected').length === 1);
      await page.$$eval('.ability-chip', (chips) => chips[1].click());
      await page.waitForFunction(() => document.querySelectorAll('.ability-chip')[1].classList.contains('selected'));
      assert.equal(await page.$$eval('.ability-chip.selected', (chips) => chips.length), 1);
      await page.click('.btn-primary');
      assert.deepEqual(await page.evaluate(() => window.sentIntent), { type: 'resolve_pending_choice', accept: true, selectedTrashOptionId: 'first:b' });
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(bounds.scrollWidth <= bounds.viewport, JSON.stringify(bounds));
      await page.screenshot({ path: path.resolve(`artifacts/trash_prompt_${width}.png`), fullPage: true });
      await page.evaluate(() => window.renderReview('second'));
      await page.waitForFunction(() => document.querySelector('.btn-primary').disabled);
      assert.equal(await page.$$eval('.ability-chip.selected', (chips) => chips.length), 0);
      console.log(`${width}px: independent duplicate selection, exact option submission, reset, and no overflow passed`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
