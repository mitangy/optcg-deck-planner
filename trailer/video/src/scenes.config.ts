import type {ClipId, ClipDef, FocusKey, SceneDef, CaptionDef, Rect, Edit} from './types';

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
  '12-phone-portrait': {file: 'clips/12-phone-portrait.mp4', duration: 12.5, orientation: 'portrait'},
  '13-phone-landscape': {file: 'clips/13-phone-landscape.mp4', duration: 5, orientation: 'landscape', aspect: 1624 / 750},
};

export const TOTAL_SECONDS = 68.5;

export const SCENES: SceneDef[] = [
  {
    id: 'landing', clip: '01-landing', start: 0, dur: 5, transition: 'cut',
    clipDelay: 1.2, rate: 1.3,
    focus: [f(0, FULL), f(1.8, r(0.18, 0.02, 0.64)), f(3.6, r(0.22, 0.06, 0.56))],
  },
  {
    id: 'turn', clip: '02-turn', start: 5, dur: 8.5, trimStart: 1.3, rate: 1.3, transition: 'zoom',
    eyebrow: 'Drag. Attach. Attack.',
    focus: [f(0, r(0.0, 0.1, 0.9)), f(2.6, r(0.0, 0.2, 0.8)), f(5.0, FULL), f(7.3, r(0.05, 0.0, 0.92))],
  },
  {
    id: 'themes', clip: '03-themes', start: 24, dur: 2, trimStart: 2.9, transition: 'cut',
    eyebrow: 'Crew colour themes',
    focus: [f(0, FULL)],
  },
  {
    id: 'art-mat', clip: '04-custom-art', start: 26, dur: 3, trimStart: 0.5, rate: 1.2, transition: 'wipe-left',
    eyebrow: 'Your playmat',
    focus: [f(0, r(0.17, 0.12, 0.7)), f(1.0, r(0.22, 0.18, 0.62)), f(2.3, r(0.17, 0.0, 0.7))],
  },
  {
    id: 'art-back', clip: '04-custom-art', start: 29, dur: 2.5, trimStart: 5.7, rate: 1.5, transition: 'fade',
    eyebrow: 'Your card backs',
    focus: [f(0, r(0.17, 0.05, 0.7)), f(0.8, r(0.2, 0.25, 0.65)), f(1.9, r(0.17, 0.05, 0.7))],
  },
  {
    id: 'art-don', clip: '04-custom-art', start: 31.5, dur: 1.5, trimStart: 10.1, rate: 1.2, transition: 'fade',
    eyebrow: 'Your DON!! art',
    focus: [f(0, r(0.17, 0.1, 0.7))],
  },
  {
    id: 'art-board', clip: '04-custom-art', start: 33, dur: 2.5, trimStart: 12.6, transition: 'fade',
    eyebrow: 'All of it, on the table',
    focus: [f(0, FULL), f(0.5, r(0.0, 0.2, 0.85))],
  },
  {
    id: 'layout-hand', clip: '05-layout', start: 35.5, dur: 2.5, trimStart: 3.4, rate: 1.3, transition: 'wipe-right',
    eyebrow: 'Arrange the table your way',
    focus: [f(0, r(0.05, 0.25, 0.85))],
  },
  {
    id: 'layout-tilt', clip: '05-layout', start: 38, dur: 3.5, trimStart: 7.2, rate: 1.2, transition: 'fade',
    eyebrow: 'Arrange the table your way',
    focus: [f(0, r(0.3, 0.0, 0.7)), f(0.8, r(0.15, 0.15, 0.7)), f(1.7, FULL)],
  },
  {
    id: 'friends-lobby', clip: '06-friends', start: 41.5, dur: 2.5, trimStart: 0.8, rate: 1.2, transition: 'zoom',
    eyebrow: 'Invite a friend',
    focus: [f(0, r(0.2, 0.05, 0.66))],
  },
  {
    id: 'friends-room', clip: '06-friends', start: 44, dur: 3.5, trimStart: 4.3, transition: 'fade',
    eyebrow: 'Invite a friend',
    focus: [f(0, FULL)],
  },
  {
    id: 'spectate', clip: '07-spectate', start: 47.5, dur: 4.5, transition: 'wipe-left',
    eyebrow: 'Watch live matches',
    focus: [f(0, FULL), f(1.2, r(0.02, 0.02, 0.96))],
  },
  {
    id: 'ranked-seat', clip: '08-ranked', start: 52, dur: 3, trimStart: 0.6, rate: 1.1, transition: 'zoom',
    eyebrow: 'Ranked ladder',
    focus: [f(0, FULL)],
  },
  {
    id: 'ranked-board', clip: '08-ranked', start: 55, dur: 2, trimStart: 4.5, transition: 'fade',
    eyebrow: 'Ranked ladder',
    focus: [f(0, r(0.3, 0.0, 0.6))],
  },
  {
    id: 'logpose-review', clip: '09-logpose', start: 57, dur: 3.5, trimStart: 0.6, rate: 1.4, transition: 'zoom',
    eyebrow: 'Log Pose, your AI deck analyst',
    focus: [f(0, r(0.22, 0.0, 0.56)), f(1.6, r(0.22, 0.18, 0.56)), f(2.7, r(0.22, 0.22, 0.56))],
  },
  {
    id: 'logpose-replay', clip: '09-logpose', start: 60.5, dur: 4, trimStart: 7.2, rate: 1.1, transition: 'fade',
    eyebrow: 'Replay every turn',
    focus: [f(0, FULL)],
  },
];

export const CAPTIONS: CaptionDef[] = [
  {start: 1.5, end: 5, words: [{t: 'Play OPTCG'}, {t: 'online, free.', em: true}]},
  {start: 5, end: 13.5, words: [{t: 'Built to feel like'}, {t: 'the table.', em: true}]},
  {start: 13.5, end: 20, words: [{t: 'Plays great on'}, {t: 'your phone.', em: true}]},
  {start: 20, end: 24, words: [{t: 'Play it'}, {t: 'on the go.', em: true}]},
  {start: 24, end: 41.5, words: [{t: 'Make it'}, {t: 'yours.', em: true}]},
  {start: 41.5, end: 52, words: [{t: 'Play with'}, {t: 'friends.', em: true}]},
  {start: 52, end: 57, words: [{t: 'Climb the'}, {t: 'ranks.', em: true}]},
  {start: 57, end: 64.5, words: [{t: 'Get better'}, {t: 'every game.', em: true}]},
];

export const PHONE = {
  start: 13.5,
  end: 24,
  handoff: 0.5,
  turnAt: 20,
  portrait: {
    clip: '12-phone-portrait' as ClipId, trimStart: 0.3, rate: 1.65, eyebrow: 'Built for one thumb',
    // the phone UI fills the footage edge to edge, so no crop-zoom: the device itself eases in slowly instead
    focus: [f(0, FULL)],
  },
  landscape: {
    clip: '13-phone-landscape' as ClipId, trimStart: 0, rate: 1.4, eyebrow: 'Portrait or landscape',
    focus: [f(0, FULL)],
  },
  homeScreen: {from: 15.5, to: 19.8, label: 'Add to Home Screen', sub: 'It installs like an app'},
  travel: [
    {icon: 'train' as const, side: 'left' as const, from: 20.9, to: 23.8, label: 'On your commute', sub: 'A game between stops'},
    {icon: 'plane' as const, side: 'right' as const, from: 21.4, to: 23.8, label: 'On a flight', sub: 'Pass the time in the air'},
  ],
};

export const END_CARD = {
  start: 64.5,
  dur: 4,
  headline: [{t: 'Free in your'}, {t: 'browser.', em: true}],
  url: 'optcgduel.app',
  disclaimer: 'Not affiliated with Bandai Namco. One Piece Card Game is a trademark of its respective owners.',
  desktop: {clip: '01-landing' as ClipId, trimStart: 2.5, focus: FULL},
  phone: {clip: '11-phone' as ClipId, trimStart: 0, focus: FULL},
};

export const FULL_EDIT: Edit = {id: 'full', scenes: SCENES, captions: CAPTIONS, phone: PHONE, endCard: END_CARD, total: TOTAL_SECONDS, intro: true, frameIn: 36};
