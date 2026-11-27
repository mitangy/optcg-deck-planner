#!/usr/bin/env node
// Renders the hype series to ../out/hype/<id>-silent.mp4 (no audio track at all: the owner adds a trending
// Instagram sound in the app) and <id>-music.mp4 (Tributary at 120 BPM + the synthesized SFX).
// Usage: node scripts/render-hype.mjs [id ...] [--silent-only|--music-only]
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(root, '../out/hype');
const ALL = ['hype-passion', 'hype-passion-16x9', 'hype-logpose', 'hype-bots', 'hype-custom', 'hype-nobeef'];
const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const todo = ids.length ? ids : ALL;
const bad = todo.filter((i) => !ALL.includes(i));
if (bad.length) { console.error(`unknown composition(s): ${bad.join(', ')}; known: ${ALL.join(', ')}`); process.exit(2); }
fs.mkdirSync(out, {recursive: true});

const run = (cmd, a) => { const r = spawnSync(cmd, a, {cwd: root, stdio: 'inherit', env: {...process.env, REMOTION_USE_PW_CHROME: process.env.REMOTION_USE_PW_CHROME ?? '1'}}); if (r.status !== 0) process.exit(r.status ?? 1); };
run('node', ['scripts/prerender-hype.mjs']);
for (const id of todo) {
  const base = ['remotion', 'render', 'src/index.ts', id];
  const flags = ['--concurrency=3', '--crf=16'];
  if (!args.includes('--music-only')) run('npx', [...base, path.join(out, `${id}-silent.mp4`), ...flags, '--muted']);
  if (!args.includes('--silent-only')) run('npx', [...base, path.join(out, `${id}-music.mp4`), ...flags, '--props={"music":true}']);
}
