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
    // 1.2s of logo reveal plays before the footage; the 5s clip is sped up so it fits.
    clipDelay: 1.2, rate: 1.3,
    focus: [f(0, FULL), f(1.8, r(0.18, 0.02, 0.64)), f(3.6, r(0.22, 0.06, 0.56))],
  },
  // 02: hand -> play Sanji -> DON!! attach -> attack arrow -> opponent reveals a life card. 1.3x from clip 1.3s.
  {
    id: 'turn', clip: '02-turn', start: 5, dur: 8.5, trimStart: 1.3, rate: 1.3, transition: 'zoom',
    eyebrow: 'Drag. Attach. Attack.',
    focus: [f(0, r(0.0, 0.1, 0.9)), f(2.6, r(0.0, 0.2, 0.8)), f(5.0, FULL), f(7.3, r(0.05, 0.0, 0.92))],
  },
  // "Make it yours." one continuous take: the crew themes cycle on their own, so no cuts.
  {
    id: 'themes', clip: '03-themes', start: 13.5, dur: 10, trimStart: 0.5, transition: 'wipe-right',
    eyebrow: 'Crew themes, light mode too',
    focus: [f(0, FULL), f(4, r(0.0, 0.0, 0.96)), f(8, FULL)],
  },
  // 04: playmat upload + crop, card back, DON!! art, then the board wearing them (dead scrolling cut out).
  {
    id: 'art-mat', clip: '04-custom-art', start: 23.5, dur: 3, trimStart: 0.5, rate: 1.2, transition: 'wipe-left',
    eyebrow: 'Your playmat',
    focus: [f(0, r(0.17, 0.12, 0.7)), f(1.0, r(0.22, 0.18, 0.62)), f(2.3, r(0.17, 0.0, 0.7))],
  },
  {
    id: 'art-back', clip: '04-custom-art', start: 26.5, dur: 2.5, trimStart: 4.4, rate: 1.4, transition: 'fade',
    eyebrow: 'Your card backs',
    focus: [f(0, r(0.17, 0.05, 0.7)), f(0.8, r(0.2, 0.25, 0.65)), f(1.9, r(0.17, 0.05, 0.7))],
  },
  {
    id: 'art-don', clip: '04-custom-art', start: 29, dur: 1.5, trimStart: 8.0, rate: 1.2, transition: 'fade',
    eyebrow: 'Your DON!! art',
    focus: [f(0, r(0.17, 0.1, 0.7))],
  },
  {
    id: 'art-board', clip: '04-custom-art', start: 30.5, dur: 2.5, trimStart: 10.1, transition: 'fade',
    eyebrow: 'All of it, on the table',
    focus: [f(0, FULL), f(0.5, r(0.0, 0.2, 0.85))],
  },
  {
    id: 'layout-hand', clip: '05-layout', start: 33, dur: 2.5, trimStart: 3.4, rate: 1.3, transition: 'wipe-right',
    eyebrow: 'Arrange the table your way',
    focus: [f(0, r(0.05, 0.25, 0.85))],
  },
  {
    id: 'layout-tilt', clip: '05-layout', start: 35.5, dur: 3.5, trimStart: 7.2, rate: 1.2, transition: 'fade',
    eyebrow: 'Arrange the table your way',
    focus: [f(0, r(0.3, 0.0, 0.7)), f(0.9, r(0.15, 0.15, 0.7)), f(2.3, FULL)],
  },
  {
    id: 'friends-lobby', clip: '06-friends', start: 39, dur: 2.5, trimStart: 0.8, rate: 1.4, transition: 'zoom',
    eyebrow: 'Invite a friend',
    focus: [f(0, r(0.2, 0.05, 0.66))],
  },
  {
    id: 'friends-room', clip: '06-friends', start: 41.5, dur: 3.5, trimStart: 4.3, transition: 'fade',
    eyebrow: 'Invite a friend',
    focus: [f(0, FULL)],
  },
  {
    id: 'spectate', clip: '07-spectate', start: 45, dur: 4.5, transition: 'wipe-left',
    eyebrow: 'Watch live matches',
    focus: [f(0, FULL), f(1.2, r(0.02, 0.02, 0.96))],
  },
  {
    id: 'ranked-seat', clip: '08-ranked', start: 49.5, dur: 3, trimStart: 0.6, rate: 1.1, transition: 'zoom',
    eyebrow: 'Ranked ladder',
    focus: [f(0, FULL)],
  },
  {
    id: 'ranked-board', clip: '08-ranked', start: 52.5, dur: 2, trimStart: 4.5, transition: 'fade',
    eyebrow: 'Ranked ladder',
    focus: [f(0, r(0.3, 0.0, 0.6))],
  },
  {
    id: 'logpose-review', clip: '09-logpose', start: 54.5, dur: 3.5, trimStart: 0.6, rate: 1.4, transition: 'zoom',
    eyebrow: 'Log Pose, your AI deck analyst',
    focus: [f(0, r(0.22, 0.0, 0.56)), f(1.6, r(0.22, 0.18, 0.56)), f(2.7, r(0.22, 0.22, 0.56))],
  },
  {
    id: 'logpose-replay', clip: '09-logpose', start: 58, dur: 4, trimStart: 7.2, rate: 1.1, transition: 'fade',
    eyebrow: 'Replay every turn',
    focus: [f(0, FULL)],
  },
  {
    id: 'planner', clip: '10-planner', start: 62, dur: 4.5, trimStart: 0.4, transition: 'wipe-right',
    eyebrow: 'Deck planner + market prices',
    focus: [f(0, FULL), f(1.5, r(0.35, 0.2, 0.65))],
  },
  {
    id: 'planner-duel', clip: '10-planner', start: 66.5, dur: 1.5, trimStart: 7.4, transition: 'fade',
    eyebrow: 'Play in Duel',
    focus: [f(0, FULL)],
  },
];

/** On-screen lines. `em: true` words get the gold/bold treatment. Times in seconds. */
export const CAPTIONS: CaptionDef[] = [
  {start: 1.5, end: 5, words: [{t: 'The One Piece'}, {t: 'Card Game,'}, {t: 'online.', em: true}]},
  {start: 5, end: 13.5, words: [{t: 'Built to feel like'}, {t: 'the table.', em: true}]},
  {start: 13.5, end: 39, words: [{t: 'Make it'}, {t: 'yours.', em: true}]},
  {start: 39, end: 49.5, words: [{t: 'Play with'}, {t: 'friends.', em: true}]},
  {start: 49.5, end: 54.5, words: [{t: 'Climb the'}, {t: 'ranks.', em: true}]},
  {start: 54.5, end: 62, words: [{t: 'Get better'}, {t: 'every game.', em: true}]},
  {start: 62, end: 68, words: [{t: 'Plan decks.'}, {t: 'Track prices.', em: true}]},
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
