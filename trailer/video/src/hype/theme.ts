import {continueRender, delayRender, staticFile} from 'remotion';
import {COLORS} from '../theme';

// The app's own type: Bricolage Grotesque headings, Outfit body, Chakra Petch numbers (duel-web tokens.css).
const faces = [
  new FontFace('Bricolage Grotesque', `url(${staticFile('fonts/Bricolage-latin.woff2')}) format('woff2')`, {weight: '700 800'}),
  new FontFace('Outfit', `url(${staticFile('fonts/Outfit-latin.woff2')}) format('woff2')`, {weight: '400 700'}),
  new FontFace('Chakra Petch', `url(${staticFile('fonts/ChakraPetch-600.woff2')}) format('woff2')`, {weight: '600'}),
  new FontFace('Chakra Petch', `url(${staticFile('fonts/ChakraPetch-700.woff2')}) format('woff2')`, {weight: '700'}),
];
const handle = delayRender('hype fonts');
Promise.all(faces.map((f) => f.load()))
  .then((loaded) => loaded.forEach((f) => (document.fonts as unknown as {add(f: FontFace): void}).add(f)))
  .catch((e) => console.error('hype font load failed', e))
  .finally(() => continueRender(handle));

export const HEAD = `'Bricolage Grotesque', system-ui, sans-serif`;
export const BODY = `Outfit, system-ui, sans-serif`;
export const NUM = `'Chakra Petch', ui-monospace, sans-serif`;
export {COLORS};

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

/** Instagram overlays: keep text out of the top 220 px and the bottom 380 px of a 1080x1920 frame. */
export const SAFE_TOP = 220;
export const SAFE_BOTTOM = 380;

export type HypeLayout = {W: number; H: number; vertical: boolean; top: number; bottom: number};
export const L_9x16: HypeLayout = {W: 1080, H: 1920, vertical: true, top: SAFE_TOP, bottom: 1920 - SAFE_BOTTOM};
export const L_16x9: HypeLayout = {W: 1920, H: 1080, vertical: false, top: 70, bottom: 1010};

export type ClipInfo = {file: string; w: number; h: number; fx?: number};
/** Capture sizes (px) of the clips in public/hype/clips. */
const CLIP_TABLE = {
  board: {file: 'hype-board.mp4', w: 1440, h: 1080, fx: 0.36},
  bot: {file: 'hype-bot.mp4', w: 1440, h: 1080, fx: 0.36},
  review: {file: 'hype-review.mp4', w: 1440, h: 1080, fx: 0.36},
  theming: {file: 'hype-theming.mp4', w: 1440, h: 1080, fx: 0.36},
  artBoard: {file: 'hype-art-board.mp4', w: 1440, h: 1080, fx: 0.36},
  logpose: {file: 'hype-logpose.mp4', w: 900, h: 1040},
  art: {file: 'hype-art.mp4', w: 900, h: 1040},
  import: {file: 'hype-import.mp4', w: 900, h: 1040},
  phone: {file: 'hype-phone.mp4', w: 750, h: 1624},
} satisfies Record<string, ClipInfo>;
export type ClipId = keyof typeof CLIP_TABLE;
export const CLIPS: Record<ClipId, ClipInfo> = CLIP_TABLE;
