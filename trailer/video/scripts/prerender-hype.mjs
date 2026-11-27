#!/usr/bin/env node
// Stages everything the hype compositions need into public/hype/ (gitignored): the fresh screen captures
// from trailer/clips, the synthesized SFX, and the licensed "Tributary" bed prepared at 120 BPM.
// Media is never committed: CI rejects it.
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeMotionSfx, sfxSourceHash} from './make-motion-sfx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dst = path.join(root, 'public/hype');
const clipsSrc = process.env.HYPE_CLIPS ?? path.resolve(root, '../clips');
const cacheDir = process.env.MOTION_CARD_CACHE ?? path.resolve(root, '.motion-card-cache');
fs.mkdirSync(cacheDir, {recursive: true});
fs.rmSync(dst, {recursive: true, force: true});
fs.mkdirSync(path.join(dst, 'clips'), {recursive: true});

// 1. Captures: trailer/capture/clips/2x-hype-*.ts write trailer/clips/hype-*.mp4 (+ .marks.json).
let n = 0;
for (const f of fs.existsSync(clipsSrc) ? fs.readdirSync(clipsSrc) : []) {
  if (!/^hype-.*\.(mp4|marks\.json)$/.test(f)) continue;
  fs.copyFileSync(path.join(clipsSrc, f), path.join(dst, 'clips', f));
  n++;
}
console.log(`hype prerender: ${n} capture file(s)`);

// 2. SFX (same synth as the motion piece).
const sfxCache = path.join(cacheDir, `sfx-${sfxSourceHash()}`);
if (!fs.existsSync(path.join(sfxCache, '.hash'))) { fs.rmSync(sfxCache, {recursive: true, force: true}); await makeMotionSfx(sfxCache); }
fs.cpSync(sfxCache, path.join(dst, 'sfx'), {recursive: true});

// 3. Music: the owner's licensed "Tributary" (Lish Grooves) and nothing else. Same prep as the motion piece:
// 29.23 s from MOTION_MUSIC_START, time-stretched from MOTION_MUSIC_BPM to 120 BPM, loudnormed to -14 LUFS, 48 kHz WAV.
const musicSrc = [process.env.MOTION_MUSIC, '/mnt/project-files/motion/tributary-lish-grooves-source.mp3'].filter(Boolean).find((p) => fs.existsSync(p));
const start = Number(process.env.MOTION_MUSIC_START ?? 164.37);
const bpm = Number(process.env.MOTION_MUSIC_BPM ?? 129.2);
if (!musicSrc) { console.error('hype prerender: music source not found (set MOTION_MUSIC); the -music versions cannot be rendered'); process.exitCode = 1; }
else {
  const st = fs.statSync(musicSrc);
  const key = crypto.createHash('sha1').update(JSON.stringify([path.resolve(musicSrc), st.size, st.mtimeMs, start, bpm, 'v1'])).digest('hex').slice(0, 12);
  const cached = path.join(cacheDir, `music-${key}.wav`);
  if (!fs.existsSync(cached)) {
    const pre = `atrim=start=${start}:end=${start + 29.23},asetpts=PTS-STARTPTS,rubberband=tempo=${(120 / bpm).toFixed(6)}`;
    const LN = 'I=-14:TP=-1.5:LRA=11';
    const m = spawnSync('ffmpeg', ['-hide_banner', '-i', musicSrc, '-af', `${pre},loudnorm=${LN}:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'});
    let norm = `loudnorm=${LN}`;
    const j = m.stderr?.match(/\{[^{}]*"input_i"[^{}]*\}/s);
    if (j) { const d = JSON.parse(j[0]); norm = `loudnorm=${LN}:measured_I=${d.input_i}:measured_TP=${d.input_tp}:measured_LRA=${d.input_lra}:measured_thresh=${d.input_thresh}:offset=${d.target_offset}:linear=true`; }
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', musicSrc, '-af', `${pre},${norm},aresample=48000`, '-ac', '2', '-c:a', 'pcm_s16le', cached], {encoding: 'utf8'});
    if (r.status !== 0) { console.error(`hype prerender: music prep failed ${r.stderr.trim()}`); fs.rmSync(cached, {force: true}); process.exitCode = 1; }
  }
  if (fs.existsSync(cached)) fs.copyFileSync(cached, path.join(dst, 'music.wav'));
}
console.log('hype prerender: done');
