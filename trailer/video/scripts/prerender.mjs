#!/usr/bin/env node
// Run before studio/render. Copies ../clips/*.mp4 into public/clips (gitignored),
// probes real clip durations, and records whether public/music.mp3 exists.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const clipsSrc = path.resolve(root, '../clips');
const clipsDst = path.join(root, 'public/clips');

fs.rmSync(clipsDst, {recursive: true, force: true});
fs.mkdirSync(clipsDst, {recursive: true});

const clips = {};
if (fs.existsSync(clipsSrc)) {
  for (const f of fs.readdirSync(clipsSrc).filter((n) => n.endsWith('.mp4'))) {
    const id = f.replace(/\.mp4$/, '');
    fs.copyFileSync(path.join(clipsSrc, f), path.join(clipsDst, f));
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(clipsSrc, f)], {encoding: 'utf8'});
    const dur = parseFloat(p.stdout);
    clips[id] = {file: `clips/${f}`, duration: Number.isFinite(dur) ? dur : null};
  }
}
const hasMusic = fs.existsSync(path.join(root, 'public/music.mp3'));
fs.writeFileSync(path.join(root, 'src/generated.json'), JSON.stringify({hasMusic, clips}, null, 2) + '\n');
console.log(`prerender: ${Object.keys(clips).length} clip(s), music ${hasMusic ? 'found' : 'absent (rendering silent)'}`);
