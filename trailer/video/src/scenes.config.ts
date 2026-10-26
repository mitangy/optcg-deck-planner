/**
 * SINGLE TUNING FILE for the trailer edit.
 *
 *  - CLIPS      clip manifest: id -> file, default trim start, nominal duration.
 *               (the real duration is probed by `npm run prerender`; if a real
 *               clip is shorter than a scene needs, its last frame is held)
 *  - SCENES     the timeline: when each clip is on screen, how it is trimmed /
 *               sped up, how it cuts in, and the camera "focus" keyframes.
 *  - CAPTIONS   the on-screen lines (kinetic type) and when they live.
 *  - END_CARD   what the final desktop + phone frames show.
 *
 * All times are SECONDS. The edit is on a 120 BPM grid: keep `start` and
 * `dur` multiples of 0.5 so cuts land on the beat (a warning prints in the
 * console if one is off-grid).
 *
 * FOCUS: a rect in normalised clip coordinates (0..1), x/y = top-left,
 * w/h = size. The camera zooms/pans so that rect fills the frame (zoom is
 * limited to what keeps the view inside the footage). `at` is seconds from the
 * scene start; the camera springs to each rect when its `at` is reached.
 * `r(x, y, w)` is shorthand for a 16:9-shaped rect (h = w).
 */
import type {ClipId, ClipDef, FocusKey, SceneDef, CaptionDef, Rect} from './types';

export const r = (x: number, y: number, w: number): Rect => ({x, y, w, h: w});
export const FULL: Rect = {x: 0, y: 0, w: 1, h: 1};
const f = (at: number, rect: Rect): FocusKey => ({at, rect});

export const CLIPS: Record<ClipId, ClipDef> = {
  '01-landing': {file: 'clips/01-landing.mp4', duration: 5, orientation: 'landscape'},
  '02-turn': {file: 'clips/02-turn.mp4', duration: 8, orientation: 'landscape'},
  '03-themes': {file: 'clips/03-themes.mp4', duration: 10, orientation: 'landscape'},
  '04-custom-art': {file: 'clips/04-custom-art.mp4', duration: 8, orientation: 'landscape'},
  '05-layout': {file: 'clips/05-layout.mp4', duration: 6, orientation: 'landscape'},
  '06-friends': {file: 'clips/06-friends.mp4', duration: 10, orientation: 'landscape'},
  '07-spectate': {file: 'clips/07-spectate.mp4', duration: 5, orientation: 'landscape'},
  '08-ranked': {file: 'clips/08-ranked.mp4', duration: 5, orientation: 'landscape'},
  '09-logpose': {file: 'clips/09-logpose.mp4', duration: 6, orientation: 'landscape'},
  '10-planner': {file: 'clips/10-planner.mp4', duration: 5, orientation: 'landscape'},
  '11-phone': {file: 'clips/11-phone.mp4', duration: 4, orientation: 'portrait'},
};

export const TOTAL_SECONDS = 72;

/**
 * Transitions INTO a scene (all land on the beat, run ~0.27s):
 *  cut | fade | zoom (push-in) | wipe-right / wipe-left (diagonal gold-edged wipe)
 */
export const SCENES: SceneDef[] = [
  {
    id: 'landing', clip: '01-landing', start: 0, dur: 5, transition: 'cut',
    // 1.2s of the logo reveal plays before the footage; speed it up slightly so the
    // whole 5s clip still fits. Tune `rate` / `clipDelay` once the real clip exists.
    clipDelay: 1.2, rate: 1.3,
    focus: [f(0, FULL), f(2.4, r(0.1, 0.12, 0.8)), f(3.9, r(0.2, 0.25, 0.6))],
  },
  {
    id: 'turn', clip: '02-turn', start: 5, dur: 7, trimStart: 0.5, transition: 'zoom',
    eyebrow: 'Drag. Attach. Attack.',
    focus: [f(0, FULL), f(1.0, r(0.15, 0.45, 0.7)), f(3.0, r(0.2, 0.05, 0.6)), f(5.0, r(0.3, 0.3, 0.55)), f(6.2, FULL)],
  },
  // "Make it yours." part 1: crew themes as fast on-beat cuts (2s = 4 beats each) from one clip.
  {id: 'themes-1', clip: '03-themes', start: 12, dur: 2, trimStart: 0, transition: 'wipe-right', eyebrow: 'Crew themes', focus: [f(0, FULL)]},
  {id: 'themes-2', clip: '03-themes', start: 14, dur: 2, trimStart: 2, transition: 'wipe-left', eyebrow: 'Crew themes', focus: [f(0, r(0.05, 0.1, 0.9)), f(1.5, r(0.1, 0.18, 0.8))]},
  {id: 'themes-3', clip: '03-themes', start: 16, dur: 2, trimStart: 4, transition: 'wipe-right', eyebrow: 'Crew themes', focus: [f(0, r(0.2, 0.3, 0.6)), f(1.5, r(0.15, 0.25, 0.7))]},
  {id: 'themes-4', clip: '03-themes', start: 18, dur: 2, trimStart: 6, transition: 'wipe-left', eyebrow: 'Crew themes', focus: [f(0, FULL), f(1.5, r(0.0, 0.0, 0.9))]},
  {id: 'themes-5', clip: '03-themes', start: 20, dur: 2, trimStart: 8, transition: 'wipe-right', eyebrow: 'Light mode too', focus: [f(0, r(0.1, 0.1, 0.85)), f(1.5, FULL)]},
  {
    id: 'custom-art', clip: '04-custom-art', start: 22, dur: 10, transition: 'wipe-left',
    eyebrow: 'Your playmat. Your card backs. Your DON!!',
    rate: 0.8, // 8s clip stretched over 10s; set to 1 if the real clip is longer
    focus: [f(0, r(0.0, 0.05, 0.75)), f(3.5, r(0.25, 0.1, 0.7)), f(6.5, FULL), f(8.0, r(0.15, 0.3, 0.7))],
  },
  {
    id: 'layout', clip: '05-layout', start: 32, dur: 6, transition: 'wipe-right',
    eyebrow: 'Arrange the table your way',
    focus: [f(0, FULL), f(1.0, r(0.55, 0.2, 0.45)), f(3.0, r(0.1, 0.5, 0.7)), f(4.8, FULL)],
  },
  {
    id: 'friends', clip: '06-friends', start: 38, dur: 10, transition: 'zoom',
    eyebrow: 'Invite a friend',
    focus: [f(0, r(0.0, 0.05, 0.6)), f(3.0, r(0.1, 0.1, 0.7)), f(6.0, FULL), f(8.0, r(0.2, 0.25, 0.6))],
  },
  {
    id: 'spectate', clip: '07-spectate', start: 48, dur: 5, transition: 'wipe-left',
    eyebrow: 'Watch live matches',
    focus: [f(0, FULL), f(1.5, r(0.1, 0.1, 0.8)), f(3.5, r(0.25, 0.3, 0.6))],
  },
  {
    id: 'ranked', clip: '08-ranked', start: 53, dur: 5, transition: 'zoom',
    eyebrow: 'Ranked ladder',
    focus: [f(0, r(0.55, 0.0, 0.45)), f(2.5, FULL), f(3.5, r(0.2, 0.2, 0.6))],
  },
  {
    id: 'logpose', clip: '09-logpose', start: 58, dur: 6, transition: 'zoom',
    eyebrow: 'Log Pose, your AI deck analyst',
    focus: [f(0, FULL), f(1.5, r(0.5, 0.05, 0.5)), f(4.0, r(0.1, 0.2, 0.7))],
  },
  {
    id: 'planner', clip: '10-planner', start: 64, dur: 4, trimStart: 0.5, transition: 'wipe-right',
    eyebrow: 'Deck planner + market prices',
    focus: [f(0, FULL), f(1.5, r(0.45, 0.1, 0.55)), f(3.0, r(0.2, 0.3, 0.6))],
  },
];

/** On-screen lines. `em: true` words get the gold/bold treatment. Times in seconds. */
export const CAPTIONS: CaptionDef[] = [
  {start: 1.5, end: 5, words: [{t: 'The One Piece'}, {t: 'Card Game,'}, {t: 'online.', em: true}]},
  {start: 5, end: 12, words: [{t: 'Built to feel like'}, {t: 'the table.', em: true}]},
  {start: 12, end: 38, words: [{t: 'Make it'}, {t: 'yours.', em: true}]},
  {start: 38, end: 53, words: [{t: 'Play with'}, {t: 'friends.', em: true}]},
  {start: 53, end: 58, words: [{t: 'Climb the'}, {t: 'ranks.', em: true}]},
  {start: 58, end: 64, words: [{t: 'Get better'}, {t: 'every game.', em: true}]},
  {start: 64, end: 68, words: [{t: 'Plan decks.'}, {t: 'Track prices.', em: true}]},
];

export const END_CARD = {
  start: 68,
  dur: 4,
  headline: [{t: 'Free in your'}, {t: 'browser.', em: true}],
  url: 'optcgduel.app',
  disclaimer: 'Not affiliated with Bandai Namco. One Piece Card Game is a trademark of its respective owners.',
  desktop: {clip: '01-landing' as ClipId, trimStart: 2.5, focus: FULL},
  phone: {clip: '11-phone' as ClipId, trimStart: 0, focus: FULL},
};
