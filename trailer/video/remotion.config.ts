import {Config} from '@remotion/cli/config';
import fs from 'node:fs';
import path from 'node:path';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(3);

// Remotion downloads its own chrome-headless-shell. If that is blocked,
// fall back to the Playwright headless shell that ships on the dev box.
const pw = '/opt/pw-browsers';
try {
  const dir = fs.readdirSync(pw).find((d) => d.startsWith('chromium_headless_shell'));
  if (dir && process.env.REMOTION_USE_PW_CHROME === '1') {
    const root = path.join(pw, dir);
    const sub = fs.readdirSync(root).find((d) => d.startsWith('chrome-headless-shell') || d.startsWith('chrome-linux'));
    if (sub) Config.setBrowserExecutable(path.join(root, sub, 'chrome-headless-shell'));
  }
} catch {
  /* no playwright browsers here: use remotion's own */
}
