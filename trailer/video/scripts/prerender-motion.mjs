#!/usr/bin/env node
// Copies the stills / card art / phone frames the motion piece uses into public/motion/ (gitignored).
// Sources: MOTION_STILLS (default ../clips/stills, else /mnt/project-files/trailer/clips/stills),
//          MOTION_CLIPS (default ../clips, else /mnt/project-files/trailer/clips),
//          MOTION_CARDS (default ../../duel-web/public/cards).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pick = (env, ...c) => [process.env[env], ...c].filter(Boolean).find((p) => fs.existsSync(p));
const stills = pick('MOTION_STILLS', path.resolve(root, '../clips/stills'), '/mnt/project-files/trailer/clips/stills');
const clips = pick('MOTION_CLIPS', path.resolve(root, '../clips'), '/mnt/project-files/trailer/clips');
const cards = pick('MOTION_CARDS', path.resolve(root, '../../duel-web/public/cards'));
const dst = path.join(root, 'public/motion');
fs.rmSync(dst, {recursive: true, force: true});
fs.mkdirSync(dst, {recursive: true});

let n = 0;
const copy = (dir, name, out = name) => {
  if (!dir || !fs.existsSync(path.join(dir, name))) return console.warn(`motion prerender: missing ${name}`);
  fs.copyFileSync(path.join(dir, name), path.join(dst, out));
  n++;
};
for (const s of ['01-landing', '02-turn', '03-themes', '04-custom-art', '05-layout', '06-friends', '07-spectate', '08-ranked', '09-logpose', '10-planner', '11-phone']) copy(stills, `${s}.png`);
copy(cards, 'DON.jpg');

// Card art: clean TCGplayer CDN images (the local duel-web/public/cards files carry a SAMPLE watermark).
// Cached in public/motion/cards/<id>.jpg across runs; anything under 20 KB is the "Image coming soon" placeholder.
const CARD_PIDS = {
  'ST01-001': 288228, 'ST01-002': 288229, 'ST01-004': 288232, 'ST01-006': 288235, 'ST01-008': 288237,
  'ST01-009': 288238, 'ST01-010': 288239, 'ST01-011': 288240, 'ST01-012': 288241, 'ST01-013': 288242,
  'ST02-001': 288249, 'ST02-002': 288254, 'ST02-006': 288261, 'ST02-007': 288262,
};
const cacheDir = process.env.MOTION_CARD_CACHE ?? path.resolve(root, '.motion-card-cache');
fs.mkdirSync(cacheDir, {recursive: true});
fs.mkdirSync(path.join(dst, 'cards'), {recursive: true});
const bad = [];
for (const [id, pid] of Object.entries(CARD_PIDS)) {
  const cached = path.join(cacheDir, `${id}.jpg`);
  if (!fs.existsSync(cached) || fs.statSync(cached).size < 20000) {
    const r = spawnSync('curl', ['-sSfL', '-m', '60', '-o', cached, `https://tcgplayer-cdn.tcgplayer.com/product/${pid}_400w.jpg`], {encoding: 'utf8'});
    if (r.status !== 0) { bad.push(`${id}: download failed ${r.stderr.trim()}`); continue; }
  }
  const size = fs.statSync(cached).size;
  if (size < 20000) { bad.push(`${id} (product ${pid}): ${size} bytes, looks like the "Image coming soon" placeholder`); fs.rmSync(cached); continue; }
  fs.copyFileSync(cached, path.join(dst, 'cards', `${id}.jpg`));
  n++;
}
if (bad.length) { console.error(`motion prerender: card art problems:\n  ${bad.join('\n  ')}`); process.exit(1); }

// phone frames: one clean portrait frame, one landscape frame
const frame = (clip, t, out) => {
  const src = clips && path.join(clips, clip);
  if (!src || !fs.existsSync(src)) return console.warn(`motion prerender: missing ${clip}`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', src, '-frames:v', '1', path.join(dst, out)]);
  if (r.status === 0) n++; else console.warn(`motion prerender: ffmpeg failed for ${clip}`);
};
frame('12-phone-portrait.mp4', process.env.MOTION_PORTRAIT_T ?? 0.5, 'phone-portrait.png');
frame('13-phone-landscape.mp4', process.env.MOTION_LANDSCAPE_T ?? 4, 'phone-landscape.png');
console.log(`motion prerender: ${n} file(s) -> public/motion`);

// Ocean waves + seagulls ambience bed. Source: BigSoundBank "Sea waves and seagulls" (57.6 s),
// https://bigsoundbank.com/UPLOAD/mp3/0267.mp3 — CC0 / public-domain-equivalent, no attribution required.
// Cached in the same cache dir as the card art; public/motion/ is wiped each run, so copy it back in.
const oceanCached = path.join(cacheDir, 'ocean.mp3');
if (!fs.existsSync(oceanCached) || fs.statSync(oceanCached).size < 100000) {
  const r = spawnSync('curl', ['-sSfL', '-m', '60', '-o', oceanCached, 'https://bigsoundbank.com/UPLOAD/mp3/0267.mp3'], {encoding: 'utf8'});
  if (r.status !== 0) { console.warn(`motion prerender: ocean.mp3 download failed ${r.stderr.trim()}`); fs.rmSync(oceanCached, {force: true}); }
}
if (fs.existsSync(oceanCached)) fs.copyFileSync(oceanCached, path.join(dst, 'ocean.mp3'));
const hasOcean = fs.existsSync(path.join(dst, 'ocean.mp3'));

// src/generated.json (gitignored) is shared with the trailer; make sure it exists and knows about music.mp3.
const gen = path.join(root, 'src/generated.json');
const hasMusic = fs.existsSync(path.join(root, 'public/music.mp3'));
let cur = {clips: {}};
try { cur = JSON.parse(fs.readFileSync(gen, 'utf8')); } catch { /* absent */ }
fs.writeFileSync(gen, JSON.stringify({...cur, hasMusic, hasOcean}, null, 2) + '\n');
