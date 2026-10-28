#!/usr/bin/env node
// Renders every info-* Still (portrait 1080x1350, landscape 1920x1080, story 1080x1920) to ../out/infographics/<id>-<orientation>.png.
// Bundles once. `node scripts/render-infographics.mjs [id-substring ...]` renders only matching ids.
import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(root, '../out/infographics');
fs.mkdirSync(outDir, {recursive: true});

const shots = path.join(root, 'public/infographics/shots');
if (!fs.existsSync(shots) || fs.readdirSync(shots).length === 0) {
  console.error('No screenshots in public/infographics/shots. Run: npm run infographics:shots');
  process.exit(1);
}

let browserExecutable;
if (process.env.REMOTION_USE_PW_CHROME === '1') {
  const pw = '/opt/pw-browsers';
  const dir = fs.readdirSync(pw).find((d) => d.startsWith('chromium_headless_shell'));
  if (dir) {
    const sub = fs.readdirSync(path.join(pw, dir)).find((d) => d.startsWith('chrome-headless-shell') || d.startsWith('chrome-linux'));
    if (sub) browserExecutable = path.join(pw, dir, sub, 'chrome-headless-shell');
  }
}

const filters = process.argv.slice(2);
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public')});
const comps = (await getCompositions(serveUrl, {browserExecutable})).filter((c) => c.id.startsWith('info-'));
for (const c of comps) {
  if (filters.length && !filters.some((f) => c.id.includes(f))) continue;
  const file = path.join(outDir, `${c.id.replace(/^info-/, '')}.png`);
  await renderStill({composition: c, serveUrl, output: file, imageFormat: 'png', browserExecutable, scale: 1});
  console.log(`rendered ${path.relative(root, file)}`);
}
