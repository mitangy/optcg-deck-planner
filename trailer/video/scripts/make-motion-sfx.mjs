#!/usr/bin/env node
// Renders the motion piece's sound effects to 48 kHz 16-bit mono WAVs: public/motion/sfx/<id>.wav (gitignored).
// Usage: node scripts/make-motion-sfx.mjs [outDir]
//
// Everything is synthesized with WebAudio in an OfflineAudioContext inside Playwright's Chromium, so there is
// nothing to download or license. The game sounds reuse the exact recipes of duel-web/src/board/sfx.ts (noiseBurst,
// NOTES) and turnAlert.ts (playNotes); whoosh / impact / riser / pop / shimmer are motion-design sounds the app lacks.
// Noise comes from a seeded PRNG (never Math.random) so renders are deterministic. Each file is peak-normalised to
// -3 dBFS; the mix level of every cue lives in src/motion/sfx.ts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SR = 48000;
const PEAK = Math.pow(10, -3 / 20);

/** Hash of this file: prerender-motion.mjs re-renders only when it changes. */
export const sfxSourceHash = () => crypto.createHash('sha1').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);

/** Runs in the browser. Returns {id: number[]} of mono samples (before normalisation). */
function synthAll(sr) {
  // Seeded noise (mulberry32), one stream per sound so adding a sound never changes another.
  const rngFor = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---- the app's recipes (duel-web/src/board/sfx.ts + turnAlert.ts), scheduled on an offline context ----
  const noiseBurst = (ctx, rng, at, len, gain, cutoff, kind) => {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * len));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (rng() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    filter.type = kind;
    filter.frequency.value = cutoff;
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(at);
  };
  const playNotes = (ctx, notes, at0 = 0) => {
    for (const n of notes) {
      const t = at0 + n.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.len);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(n.gain, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.len + 0.02);
    }
  };
  const GLINT = (freq, at, gain = 0.07) => ({freq, at, len: 0.09, gain, type: 'sine'});
  const NOTES = {
    play: [{freq: 440, at: 0, len: 0.1, gain: 0.1, type: 'triangle'}],
    attack: [{freq: 300, at: 0, len: 0.15, gain: 0.07, type: 'sawtooth', to: 620}],
    counter: [GLINT(784, 0, 0.1), GLINT(988, 0.07, 0.1)],
    don: [GLINT(1175, 0), GLINT(1568, 0.05)],
    trigger: [GLINT(660, 0, 0.1), GLINT(880, 0.07, 0.1), GLINT(1320, 0.14, 0.1)],
    win: [523, 659, 784, 1047].map((f, i) => ({freq: f, at: i * 0.11, len: 0.3, gain: 0.14, type: 'sine'})),
  };

  // ---- motion-design sounds ----
  /** Bandpassed noise whose centre sweeps lo -> hi; swell in the first 40 %, then fade. */
  const whoosh = (ctx, rng, len, lo, hi, gain = 1) => {
    const frames = Math.floor(sr * len);
    const buf = ctx.createBuffer(1, frames, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = rng() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(lo, 0);
    bp.frequency.exponentialRampToValueAtTime(hi, len * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(gain, len * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, len);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(0);
  };
  const sine = (ctx, f0, f1, len, gain, at = 0, type = 'sine') => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + len + 0.02);
  };
  const thump = (ctx, len, gain, f0 = 120, f1 = 45) => sine(ctx, f0, f1, len, gain);
  const impact = (ctx, rng) => {
    thump(ctx, 0.4, 1);
    noiseBurst(ctx, rng, 0, 0.28, 0.5, 700, 'lowpass');
    noiseBurst(ctx, rng, 0, 0.04, 0.35, 5000, 'highpass'); // crack
  };
  /** Noise + sine sweep that gets louder along a cubic curve, so the last second carries it. */
  const riser = (ctx, rng, len) => {
    const frames = Math.floor(sr * len);
    const buf = ctx.createBuffer(1, frames, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = rng() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(300, 0);
    bp.frequency.exponentialRampToValueAtTime(7000, len);
    const g = ctx.createGain();
    const curve = (t) => Math.pow(t / len, 3);
    for (let k = 0; k <= 48; k++) g.gain.linearRampToValueAtTime(0.0001 + 0.6 * curve((k / 48) * len), (k / 48) * len);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, 0);
    osc.frequency.exponentialRampToValueAtTime(1800, len);
    const og = ctx.createGain();
    for (let k = 0; k <= 48; k++) og.gain.linearRampToValueAtTime(0.0001 + 0.4 * curve((k / 48) * len), (k / 48) * len);
    osc.connect(og).connect(ctx.destination);
    osc.start(0);
    osc.stop(len);
  };
  const shimmer = (ctx, gain = 0.1) => {
    [[1568, 0], [2093, 0.07], [2637, 0.14]].forEach(([f, at], i) => {
      sine(ctx, f, f, 0.45 - i * 0.05, gain * (1 - i * 0.12), at);
      sine(ctx, f * 2.005, f * 2.005, 0.25, gain * 0.25, at); // sparkle partial
    });
  };
  const attackSweep = (ctx) => {
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, 0);
    osc.frequency.exponentialRampToValueAtTime(1100, 0.6);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, 0);
    lp.frequency.exponentialRampToValueAtTime(4500, 0.6);
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.1, 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.62);
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.start(0);
    osc.stop(0.64);
  };

  // id -> [seconds, builder(ctx, rng)]
  const DEFS = {
    // whooshes: cutoff sweep 400 -> 4000 Hz; -hi / -lo shift the sweep for variety
    whoosh: [0.4, (c, r) => whoosh(c, r, 0.35, 400, 4000)],
    'whoosh-hi': [0.4, (c, r) => whoosh(c, r, 0.35, 560, 5600)],
    'whoosh-lo': [0.4, (c, r) => whoosh(c, r, 0.35, 280, 2800)],
    'whoosh-short': [0.25, (c, r) => whoosh(c, r, 0.2, 400, 4000)],
    'whoosh-short-hi': [0.25, (c, r) => whoosh(c, r, 0.2, 600, 6000)],
    'whoosh-short-lo': [0.25, (c, r) => whoosh(c, r, 0.2, 300, 3000)],
    impact: [0.55, impact],
    riser: [2.45, (c, r) => riser(c, r, 2.4)],
    // pop / tick: 40 ms sine blip at several pitches
    pop: [0.08, (c) => sine(c, 1200, 1200, 0.04, 0.5)],
    'pop-lo': [0.08, (c) => sine(c, 900, 900, 0.04, 0.5)],
    'pop-hi': [0.08, (c) => sine(c, 1500, 1500, 0.04, 0.5)],
    'pop-up': [0.08, (c) => sine(c, 1900, 1900, 0.04, 0.5)],
    shimmer: [0.8, (c) => shimmer(c)],
    // the app's own cues
    draw: [0.15, (c, r) => noiseBurst(c, r, 0, 0.09, 0.09, 3200, 'bandpass')],
    tuck: [0.1, (c, r) => noiseBurst(c, r, 0, 0.05, 0.08, 1400, 'lowpass')],
    riffle: [0.4, (c, r) => { for (let i = 0; i < 7; i++) noiseBurst(c, r, i * 0.032, 0.03, 0.05 + i * 0.004, 3800, 'bandpass'); }],
    play: [0.25, (c) => playNotes(c, NOTES.play)],
    attack: [0.3, (c) => playNotes(c, NOTES.attack)],
    counter: [0.35, (c) => playNotes(c, NOTES.counter)],
    don: [0.3, (c) => playNotes(c, NOTES.don)],
    trigger: [0.45, (c) => playNotes(c, NOTES.trigger)],
    win: [1.0, (c) => playNotes(c, NOTES.win)],
    // composites
    'attack-sweep': [0.7, (c) => attackSweep(c)],
    // word slam: the app's "play" note (pitch stepped per word) over a low thump
    accent: [0.45, (c) => { playNotes(c, [{...NOTES.play[0], len: 0.14}]); thump(c, 0.3, 0.9, 110, 50); }],
    'accent-2': [0.45, (c) => { playNotes(c, [{...NOTES.play[0], freq: 523, len: 0.14}]); thump(c, 0.3, 0.9, 110, 50); }],
    'accent-3': [0.55, (c) => { playNotes(c, [{...NOTES.play[0], freq: 659, len: 0.18}]); thump(c, 0.4, 1, 120, 45); }],
  };

  return Promise.all(
    Object.entries(DEFS).map(async ([id, [secs, build]], n) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(secs * sr), sr);
      build(ctx, rngFor(0x9e3779b1 + n * 7919));
      const buf = await ctx.startRendering();
      return [id, Array.from(buf.getChannelData(0))];
    }),
  ).then(Object.fromEntries);
}

function wav16(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  return buf;
}

/** Renders every sound into outDir. Returns the list of ids. */
export async function makeMotionSfx(outDir = path.join(root, 'public/motion/sfx')) {
  const {chromium} = createRequire(import.meta.url)('playwright');
  fs.mkdirSync(outDir, {recursive: true});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const all = await page.evaluate(`(${synthAll.toString()})(${SR})`);
    for (const [id, data] of Object.entries(all)) {
      let peak = 0;
      for (const s of data) peak = Math.max(peak, Math.abs(s));
      const k = peak > 0 ? PEAK / peak : 1;
      const out = Float32Array.from(data, (s) => s * k);
      // 2 ms fade-out so a hard cut at the end of the buffer never clicks
      const fade = Math.floor(SR * 0.002);
      for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
      fs.writeFileSync(path.join(outDir, `${id}.wav`), wav16(out));
    }
    fs.writeFileSync(path.join(outDir, '.hash'), sfxSourceHash());
    return Object.keys(all);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = await makeMotionSfx(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`motion sfx: ${ids.length} file(s) -> ${process.argv[2] ?? 'public/motion/sfx'}`);
}
