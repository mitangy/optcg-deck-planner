#!/usr/bin/env node
// Makes labelled placeholder clips with ffmpeg into trailer/clips/<id>.mp4,
// ONLY for ids that do not exist yet. Real capture output is never overwritten.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clipsDir = path.resolve(here, '../../clips');
const FONT = '/usr/share/fonts/opentype/inter/Inter-Bold.otf';

// id, seconds, hue (hex colour), WxH  (keep in sync with plan.md clip contract)
const CLIPS = [
  ['01-landing', 5, '0f2a4a', [1920, 1080]],
  ['02-turn', 8, '14384a', [1920, 1080]],
  ['03-themes', 10, '3a2a56', [1920, 1080]],
  ['04-custom-art', 8, '4a2f2a', [1920, 1080]],
  ['05-layout', 6, '1d4a3e', [1920, 1080]],
  ['06-friends', 10, '2a3f66', [1920, 1080]],
  ['07-spectate', 5, '3f2a4a', [1920, 1080]],
  ['08-ranked', 5, '4a3a1d', [1920, 1080]],
  ['09-logpose', 6, '1d3f4f', [1920, 1080]],
  ['10-planner', 5, '2f4a2a', [1920, 1080]],
  ['11-phone', 4, '12304a', [750, 1624]],
];

fs.mkdirSync(clipsDir, {recursive: true});
let made = 0;
for (const [id, secs, color, [w, h]] of CLIPS) {
  const out = path.join(clipsDir, `${id}.mp4`);
  if (fs.existsSync(out)) {
    console.log(`keep   ${id} (exists)`);
    continue;
  }
  const big = Math.round(Math.min(w, h) / 9);
  const small = Math.round(big / 3);
  const vf = [
    `drawgrid=w=${Math.round(w / 12)}:h=${Math.round(w / 12)}:t=2:c=white@0.10`,
    // moving bar so motion/freezes are visible
    `drawbox=x='mod(t*${Math.round(w / 5)}\\,${w})':y=0:w=6:h=${h}:color=0xe8b64c@0.8:t=fill`,
    `drawbox=x=0:y=0:w=${w}:h=${h}:color=white@0.25:t=6`,
    `drawtext=fontfile=${FONT}:text='${id}':fontsize=${big}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-${small}`,
    `drawtext=fontfile=${FONT}:text='PLACEHOLDER %{pts\\:hms\\:0} / ${secs}s':fontsize=${small}:fontcolor=0xe8b64c:x=(w-text_w)/2:y=(h/2)+${small}`,
    // corner markers: show whether zoom/crop is clipping
    `drawbox=x=0:y=0:w=${Math.round(w / 8)}:h=${Math.round(w / 8)}:color=0xe8b64c@0.7:t=fill`,
    `drawbox=x=${w - Math.round(w / 8)}:y=${h - Math.round(w / 8)}:w=${Math.round(w / 8)}:h=${Math.round(w / 8)}:color=0x4cc3e8@0.7:t=fill`,
  ].join(',');
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x${color}:s=${w}x${h}:r=30:d=${secs}`, '-vf', vf, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', out],
    {stdio: 'inherit'},
  );
  if (r.status !== 0) {
    console.error(`ffmpeg failed for ${id}`);
    process.exit(1);
  }
  console.log(`made   ${id} (${secs}s ${w}x${h})`);
  made++;
}
console.log(made ? `${made} placeholder clip(s) written to ${clipsDir}` : 'nothing to do');
