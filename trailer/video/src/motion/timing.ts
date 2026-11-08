import {BEAT} from '../theme';

/** Scene start frames (30 fps, 120 BPM: one beat = 15 frames). Every value is a multiple of BEAT. */
export const S = {
  logo: 0,
  storm: 90,
  attack: 210,
  features: 330,
  themes: 480,
  anywhere: 600,
  stats: 720,
  end: 810,
} as const;
export const MOTION_TOTAL = 900;
/** Scenes are drawn this many frames early/late so neighbours cross-dissolve (no dead frames). */
export const OVERLAP = 9;

export const SCENE_ORDER = Object.entries(S).sort((a, b) => a[1] - b[1]) as [keyof typeof S, number][];
export const sceneEnd = (k: keyof typeof S) => {
  const i = SCENE_ORDER.findIndex(([n]) => n === k);
  return i === SCENE_ORDER.length - 1 ? MOTION_TOTAL : SCENE_ORDER[i + 1][1];
};

for (const [k, v] of Object.entries(S)) {
  if (v % BEAT !== 0) console.warn(`[motion] scene ${k} starts at ${v}, off the beat grid`);
}
