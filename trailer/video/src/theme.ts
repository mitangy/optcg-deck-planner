import {continueRender, delayRender, staticFile} from 'remotion';

// App fonts (duel-web/src/styles.css: --font-body Sora, --font-display Fraunces).
// Variable woff2 files are vendored in public/fonts (OFL) so renders work offline / behind a proxy.
const faces = [
  new FontFace('Sora', `url(${staticFile('fonts/Sora-latin.woff2')}) format('woff2')`, {weight: '200 700'}),
  new FontFace('Fraunces', `url(${staticFile('fonts/Fraunces-latin.woff2')}) format('woff2')`, {weight: '600 700'}),
];
const fontHandle = delayRender('fonts');
Promise.all(faces.map((f) => f.load()))
  .then((loaded) => loaded.forEach((f) => (document.fonts as unknown as {add(f: FontFace): void}).add(f)))
  .catch((e) => console.error('font load failed', e))
  .finally(() => continueRender(fontHandle));
export const FONT_SANS = `Sora, system-ui, sans-serif`;
export const FONT_DISPLAY = `Fraunces, Georgia, serif`;

export const FPS = 30;
export const BPM = 120;
/** One beat at 120 BPM = 0.5s = 15 frames. All cuts land on this grid. */
export const BEAT = (FPS * 60) / BPM;

export const COLORS = {
  navy0: '#050b1d',
  navy1: '#0b1630',
  navy2: '#0f2547',
  teal: '#0d4b5c',
  tealBright: '#2f8fa6',
  gold: '#e8b64c',
  goldBright: '#f6dc98',
  goldDeep: '#c7963d',
  ink: '#f4ecd8',
  muted: '#9fb1c2',
  barBg: '#0e1b30',
};

/** Title-safe margins on a 1920x1080 canvas (5%). */
export const SAFE = {x: 96, y: 54};
