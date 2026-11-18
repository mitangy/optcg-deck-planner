import {S} from './timing';

export type SfxCue = {frame: number; id: string; gain: number; rate?: number};

const at = (scene: keyof typeof S, local: number, id: string, gain: number, rate?: number): SfxCue => ({frame: S[scene] + local, id, gain, ...(rate ? {rate} : {})});

const RAW: SfxCue[] = [
  at('logo', 18, 'riser', 0.6),
  at('logo', 8, 'pop-lo', 0.22), at('logo', 12, 'pop', 0.22), at('logo', 17, 'pop', 0.24), at('logo', 23, 'pop-hi', 0.24), at('logo', 28, 'pop-up', 0.26),
  at('logo', 27, 'shimmer', 0.45),
  at('logo', 31, 'whoosh', 0.4),

  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => at('storm', 2 + i * 3, (['whoosh-short', 'whoosh-short-hi', 'whoosh-short-lo'] as const)[i % 3], 0.3 + (i % 2) * 0.06)),
  at('storm', 27, 'riffle', 0.45),
  at('storm', 15, 'accent', 0.6),     // "Draw."
  at('storm', 45, 'accent-2', 0.62),    // "Play."
  at('storm', 75, 'accent-3', 0.68),    // "Attack."

  at('attack', 0, 'whoosh-short', 0.3), at('attack', 5, 'whoosh-short-hi', 0.3), // both cards fly in
  at('attack', 25, 'don', 0.55),                                                  // DON!! lands
  at('attack', 38, 'pop-lo', 0.2), at('attack', 42, 'pop', 0.22), at('attack', 46, 'pop', 0.24), at('attack', 50, 'pop-hi', 0.26), at('attack', 54, 'pop-up', 0.3), // power count-up (+100 steps, 36-56)
  at('attack', 62, 'attack-sweep', 0.5), // arrow draws 62-92
  at('attack', 92, 'impact', 0.9),       // arrow lands
  at('attack', 98, 'tuck', 0.55),        // opponent card rests

  at('features', -2, 'whoosh', 0.4), at('features', 28, 'whoosh-hi', 0.4), at('features', 58, 'whoosh-lo', 0.4), at('features', 88, 'whoosh-hi', 0.4),
  at('features', 31, 'pop-lo', 0.3), at('features', 61, 'pop', 0.3), at('features', 91, 'pop-hi', 0.3), at('features', 121, 'pop-up', 0.32),

  ...[0, 1, 2, 3, 4].flatMap((i) => [
    at('themes', i * 15, i % 2 ? 'whoosh-short-hi' : 'whoosh-short', 0.35),
    at('themes', i * 15 + 4, 'counter', 0.3),
  ]),
  at('themes', 75, 'whoosh-short-lo', 0.4),
  at('themes', 83, 'play', 0.7),

  at('anywhere', 0, 'pop-lo', 0.3), at('anywhere', 30, 'pop', 0.3), at('anywhere', 60, 'pop', 0.3), at('anywhere', 90, 'pop-hi', 0.34),
  at('anywhere', 33, 'shimmer', 0.45),
  at('anywhere', 63, 'whoosh', 0.5),

  at('stats', 8, 'pop-lo', 0.4), at('stats', 23, 'pop', 0.4), at('stats', 38, 'pop-hi', 0.4),
  at('stats', 41, 'trigger', 0.6),

  at('end', 30, 'win', 0.6),
  at('end', 45, 'shimmer', 0.25),
];

const MIN_GAP = 3;
const EXEMPT = new Set(['riser']);

const prune = (cues: SfxCue[]): SfxCue[] => {
  const sorted = [...cues].sort((a, b) => a.frame - b.frame);
  const kept: SfxCue[] = [];
  for (const c of sorted) {
    if (EXEMPT.has(c.id)) { kept.push(c); continue; }
    const prev = [...kept].reverse().find((k) => !EXEMPT.has(k.id));
    if (prev && c.frame - prev.frame < MIN_GAP) {
      if (c.gain > prev.gain) kept[kept.indexOf(prev)] = c;
      continue;
    }
    kept.push(c);
  }
  return kept.sort((a, b) => a.frame - b.frame);
};

export const SFX_CUES: SfxCue[] = prune(RAW);
