import React from 'react';
import {AbsoluteFill, Easing, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Background} from '../Background';
import {BrandBug, CutSweep, LayoutCtx, SceneCtx, prog} from './kit';
import {COLORS, sec, type HypeLayout} from './theme';

/** `soft`: this scene has no opaque backdrop of its own, so the previous scene fades out under it instead of vanishing when its tail ends. */
export type Scene = {at: number; dur: number; node: React.ReactNode; sweep?: boolean; soft?: boolean};
export type Cue = {t: number; id: string; gain?: number};
export type HypeDef = {id: string; layout: HypeLayout; dur: number; scenes: Scene[]; cues?: Cue[]};

const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Every cut on the 0.5 s grid gets a whoosh; extra cues (pops, accents, the end-card hit) are per video. */
export const cuesFor = (def: HypeDef): Cue[] => [
  ...def.scenes.filter((s) => s.at > 0 && s.sweep !== false).map((s): Cue => ({t: s.at - 0.1, id: 'whoosh-short', gain: 0.28})),
  ...(def.cues ?? []),
];

/** Dissolve between whole scenes: a scene fades in over its first DISSOLVE frames while the previous one, extended by as many frames, is still underneath. */
const DISSOLVE = 6;
const SceneFade: React.FC<{fade: boolean; outAt?: number; children: React.ReactNode}> = ({fade, outAt, children}) => {
  const f = useCurrentFrame();
  const o = (fade ? prog(f, 0, DISSOLVE, Easing.linear) : 1) * (outAt === undefined ? 1 : 1 - prog(f, outAt, outAt + DISSOLVE, Easing.linear));
  return <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>;
};

const Scenes: React.FC<{def: HypeDef}> = ({def}) => (
  <>
    {def.scenes.map((s, i) => {
      const next = def.scenes[i + 1];
      const tail = next ? DISSOLVE : 0;
      return (
        <Sequence key={i} from={sec(s.at)} durationInFrames={sec(s.dur) + tail} layout="none">
          <SceneCtx.Provider value={sec(s.dur)}>
            <SceneFade fade={s.at > 0} outAt={next?.soft ? sec(s.dur) : undefined}>{s.node}</SceneFade>
          </SceneCtx.Provider>
          {s.at > 0 && s.sweep !== false && <CutSweep />}
        </Sequence>
      );
    })}
  </>
);

export const HypeVideo: React.FC<{def: HypeDef; music?: boolean}> = ({def, music = false}) => {
  const L = def.layout;
  const total = sec(def.dur);
  return (
    <LayoutCtx.Provider value={L}>
      <AbsoluteFill style={{background: COLORS.navy1, overflow: 'hidden'}}>
        <Background cx={L.W / 2} cy={L.H / 2} compass={L.vertical ? 820 : 700} />
        <Scenes def={def} />
        {/* brand bug: after the intro, until the end card brings the full logo */}
        <Sequence from={sec(3)} durationInFrames={sec(def.scenes[def.scenes.length - 1].at - 3)} layout="none"><BrandBug out={sec(def.scenes[def.scenes.length - 1].at - 3) - 6} /></Sequence>
        {music && (
          <>
            <Html5Audio src={staticFile('hype/music.wav')} volume={(f) => interpolate(f, [0, 12, total - 36, total - 2], [0, 0.9, 0.9, 0], CLAMP)} />
            {cuesFor(def).map((c, i) => (
              <Sequence key={i} from={Math.max(0, sec(c.t))} layout="none">
                <Html5Audio src={staticFile(`hype/sfx/${c.id}.wav`)} volume={c.gain ?? 0.4} />
              </Sequence>
            ))}
          </>
        )}
      </AbsoluteFill>
    </LayoutCtx.Provider>
  );
};

