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

/** Seizure rule: no more than 2 frame-to-frame mean-luma jumps above 12 inside any 30-frame window. */
const flashCheck = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-f', 'lavfi', '-i', `movie=${file},signalstats`, '-show_entries', 'frame_tags=lavfi.signalstats.YAVG', '-of', 'csv=p=0'], {encoding: 'utf8', maxBuffer: 1 << 26});
  if (r.status !== 0) { console.error(`flash check could not run on ${file}`); process.exit(1); }
  const y = r.stdout.split('\n').map((l) => parseFloat(l.replace(/,$/, ''))).filter((n) => !Number.isNaN(n));
  const jumps = y.slice(1).map((v, i) => (Math.abs(v - y[i]) > 12 ? 1 : 0));
  let max = 0;
  for (let i = 0; i + 30 <= jumps.length; i++) max = Math.max(max, jumps.slice(i, i + 30).reduce((a, b) => a + b, 0));
  console.log(`flash check ${path.basename(file)}: max ${max} jumps >12 per 30 frames`);
  if (max > 2) { console.error('FAIL: more than 2 luminance jumps per second (seizure rule)'); process.exit(1); }
};

const run = (cmd, a) => { const r = spawnSync(cmd, a, {cwd: root, stdio: 'inherit', env: {...process.env, REMOTION_USE_PW_CHROME: process.env.REMOTION_USE_PW_CHROME ?? '1'}}); if (r.status !== 0) process.exit(r.status ?? 1); };
run('node', ['scripts/prerender-hype.mjs']);
for (const id of todo) {
  const base = ['remotion', 'render', 'src/index.ts', id];
  const flags = ['--concurrency=3', '--crf=16'];
  if (!args.includes('--music-only')) { run('npx', [...base, path.join(out, `${id}-silent.mp4`), ...flags, '--muted']); flashCheck(path.join(out, `${id}-silent.mp4`)); }
  if (!args.includes('--silent-only')) run('npx', [...base, path.join(out, `${id}-music.mp4`), ...flags, '--props={"music":true}']);
}
