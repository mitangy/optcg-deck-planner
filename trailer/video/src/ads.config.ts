/**
 * Instagram ad cutdowns (issue #793): 15s and 30s edits for 9:16 (Stories / Reels) and 4:5 (feed).
 * Every scene is picked by id from SCENES (scenes.config.ts) with its own start / dur / trim / focus, so the footage,
 * transitions and phone section are the same pieces as the full trailer. Times in seconds on the 0.5s beat grid.
 * The first scene opens straight on gameplay (no logo intro, the frame is on screen from frame 0).
 */
import {END_CARD, FULL_EDIT, PHONE, SCENES} from './scenes.config';
import type {CaptionDef, Edit, FocusKey, Rect, SceneDef} from './types';

/**
 * Focus for the near-square footage window of the vertical layouts: view centre (cx, cy) in 0..1 clip coordinates and a
 * zoom (1 = the full clip height, which shows about 56% of its width). Clamped to the footage by the camera.
 */
export const v = (cx: number, cy: number, zoom = 1): Rect => {
  const h = 1 / zoom;
  const w = h * (9 / 16);
  return {x: cx - w / 2, y: cy - h / 2, w, h};
};
const f = (at: number, rect: Rect): FocusKey => ({at, rect});

const base = (id: string): SceneDef => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`ads.config: no scene "${id}"`);
  return s;
};
const pick = (id: string, o: Partial<SceneDef> & Pick<SceneDef, 'start' | 'dur'>): SceneDef => ({...base(id), ...o});

const em = (t: string, br = false) => ({t, em: true, br});
const cap = (start: number, end: number, ...words: CaptionDef['words']): CaptionDef => ({start, end, words});

/** End card for the ads: "Play free in your browser", the URL and the disclaimer. */
const endCard = (start: number, dur: number): Edit['endCard'] => ({
  ...END_CARD, start, dur,
  headline: [{t: 'Play free in', br: true}, em('your browser.')],
  desktop: {...END_CARD.desktop, focus: v(0.5, 0.42, 1)},
});

// ---------------------------------------------------------------------------------------------------------------
// Hook (both cuts): the attack on the turn clip, 3s, straight from the first frame.
// ---------------------------------------------------------------------------------------------------------------
const hook = (): SceneDef =>
  pick('turn', {
    start: 0, dur: 3, trimStart: 8.3, rate: 1.2, transition: 'cut', eyebrow: undefined,
    focus: [f(0, v(0.4, 0.6, 1.0)), f(1.2, v(0.4, 0.45, 1.15))],
  });
const hookCaption = (end: number) => cap(0, end, {t: 'The One Piece', br: true}, {t: 'Card Game,'}, em('online.'));

// ---------------------------------------------------------------------------------------------------------------
// 15s: hook 0-3, phone 3-7, make it yours 7-10, friends 10-12.5, end card 12.5-15
// ---------------------------------------------------------------------------------------------------------------
const phone15 = {
  ...PHONE, start: 3, turnAt: 5, end: 7,
  portrait: {...PHONE.portrait, trimStart: 0.3, rate: 2.0},
  landscape: {...PHONE.landscape, rate: 1.6},
  homeScreen: {...PHONE.homeScreen, from: 3.7, to: 4.9},
  travel: [
    {...PHONE.travel[0], from: 5.8, to: 6.9},
    {...PHONE.travel[1], from: 6.0, to: 6.9},
  ],
};

export const AD15: Edit = {
  id: 'ad15',
  total: 15,
  intro: false,
  frameIn: 0,
  phone: phone15,
  endCard: endCard(12.5, 2.5),
  scenes: [
    hook(),
    pick('themes', {start: 7, dur: 1, trimStart: 3.2, transition: 'cut', eyebrow: 'Crew colour themes', focus: [f(0, v(0.5, 0.5, 1))]}),
    pick('art-mat', {start: 8, dur: 1, trimStart: 1.6, rate: 1.8, transition: 'wipe-left', eyebrow: 'Your playmat', focus: [f(0, v(0.52, 0.4, 1.0))]}),
    pick('art-board', {start: 9, dur: 1, trimStart: 13.4, rate: 1, transition: 'fade', eyebrow: 'All of it, on the table', focus: [f(0, v(0.4, 0.55, 1.0))]}),
    pick('friends-room', {start: 10, dur: 2.5, trimStart: 4.3, transition: 'zoom', eyebrow: 'Invite a friend', focus: [f(0, v(0.45, 0.5, 1.0))]}),
  ],
  captions: [
    hookCaption(3),
    cap(3, 5, {t: 'Plays great on', br: true}, em('your phone.')),
    cap(5, 7, {t: 'Play it', br: true}, em('on the go.')),
    cap(7, 10, {t: 'Make it', br: true}, em('yours.')),
    cap(10, 12.5, {t: 'Play with', br: true}, em('friends.')),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// 30s: hook 0-3, phone 3-11, make it yours 11-17, friends + spectate 17-22, ranked 22-24.5, Log Pose 24.5-27.5, end 27.5-30
// ---------------------------------------------------------------------------------------------------------------
const phone30 = {
  ...PHONE, start: 3, turnAt: 7, end: 11,
  portrait: {...PHONE.portrait, trimStart: 0.3, rate: 1.8},
  landscape: {...PHONE.landscape, rate: 1.4},
  homeScreen: {...PHONE.homeScreen, from: 4.2, to: 6.8},
  travel: [
    {...PHONE.travel[0], from: 8.2, to: 10.9},
    {...PHONE.travel[1], from: 8.8, to: 10.9},
  ],
};

export const AD30: Edit = {
  id: 'ad30',
  total: 30,
  intro: false,
  frameIn: 0,
  phone: phone30,
  endCard: endCard(27.5, 2.5),
  scenes: [
    hook(),
    pick('themes', {start: 11, dur: 1.5, trimStart: 3.2, transition: 'cut', eyebrow: 'Crew colour themes', focus: [f(0, v(0.5, 0.5, 1))]}),
    pick('art-mat', {start: 12.5, dur: 1.5, trimStart: 1.6, rate: 1.5, transition: 'wipe-left', eyebrow: 'Your playmat', focus: [f(0, v(0.52, 0.4, 1.0))]}),
    pick('art-back', {start: 14, dur: 1.5, trimStart: 6.2, rate: 1.5, transition: 'fade', eyebrow: 'Your card backs', focus: [f(0, v(0.52, 0.3, 1.0))]}),
    pick('art-board', {start: 15.5, dur: 1.5, trimStart: 13.4, transition: 'fade', eyebrow: 'All of it, on the table', focus: [f(0, v(0.4, 0.55, 1.0))]}),
    pick('friends-room', {start: 17, dur: 2.5, trimStart: 4.3, transition: 'zoom', eyebrow: 'Invite a friend', focus: [f(0, v(0.45, 0.5, 1.0))]}),
    pick('spectate', {start: 19.5, dur: 2.5, trimStart: 1.0, transition: 'wipe-left', eyebrow: 'Watch live matches', focus: [f(0, v(0.5, 0.5, 1.0))]}),
    pick('ranked-seat', {start: 22, dur: 2.5, trimStart: 0.6, transition: 'zoom', eyebrow: 'Ranked ladder', focus: [f(0, v(0.5, 0.5, 1.0))]}),
    pick('logpose-review', {start: 24.5, dur: 3, trimStart: 0.6, rate: 1.4, transition: 'zoom', eyebrow: 'Log Pose, your AI deck analyst', focus: [f(0, v(0.5, 0.3, 1.0)), f(1.5, v(0.5, 0.6, 1.0))]}),
  ],
  captions: [
    hookCaption(3),
    cap(3, 7, {t: 'Plays great on', br: true}, em('your phone.')),
    cap(7, 11, {t: 'Play it', br: true}, em('on the go.')),
    cap(11, 17, {t: 'Make it', br: true}, em('yours.')),
    cap(17, 22, {t: 'Play with', br: true}, em('friends.')),
    cap(22, 24.5, {t: 'Climb the', br: true}, em('ranks.')),
    cap(24.5, 27.5, {t: 'Get better', br: true}, em('every game.')),
  ],
};

export const ADS = [AD15, AD30];
export {FULL_EDIT};
