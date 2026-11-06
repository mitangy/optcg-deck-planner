import React from 'react';
import {AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import generated from '../generated.json';
import {Background} from '../Background';
import {COLORS} from '../theme';
import {LayoutCtx, LeadProvider, OVERLAP, SceneFade, lerp} from './anim';
import type {MotionLayout} from './layout';
import {MOTION_TOTAL, S, SCENE_ORDER, sceneEnd} from './timing';
import {AnywhereScene} from './scenes/Anywhere';
import {AttackScene} from './scenes/Attack';
import {EndScene} from './scenes/End';
import {FeaturesScene} from './scenes/Features';
import {LogoScene} from './scenes/Logo';
import {StatsScene} from './scenes/Stats';
import {StormScene} from './scenes/Storm';
import {ThemesScene} from './scenes/Themes';

const SCENES: Record<keyof typeof S, React.FC> = {
  logo: LogoScene, storm: StormScene, attack: AttackScene, features: FeaturesScene,
  themes: ThemesScene, anywhere: AnywhereScene, stats: StatsScene, end: EndScene,
};

/** A gold band sweeping across the cut, on the beat */
const CutSweep: React.FC<{at: number; L: MotionLayout}> = ({at, L}) => (
  <Sequence from={at - 8} durationInFrames={18} layout="none">
    <SweepInner L={L} />
  </Sequence>
);
const SweepInner: React.FC<{L: MotionLayout}> = ({L}) => {
  const f = useCurrentFrame();
  const p = f / 17;
  const e = 1 - Math.pow(1 - p, 3);
  const span = L.vertical ? L.height : L.width;
  const x = lerp(-0.3, 1.3, e) * span;
  const vertical = L.vertical;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: Math.sin(p * Math.PI) * 0.9}}>
      <div style={{position: 'absolute', ...(vertical ? {left: 0, right: 0, top: x - 140, height: 280, background: `linear-gradient(180deg, transparent, rgba(232,182,76,0.28) 50%, transparent)`} : {top: 0, bottom: 0, left: x - 140, width: 280, background: `linear-gradient(90deg, transparent, rgba(232,182,76,0.28) 50%, transparent)`}), transform: vertical ? 'skewY(-8deg)' : 'skewX(-14deg)'}} />
    </div>
  );
};

const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
/** Ocean ambience envelope: in, hold, duck under the middle, swell for the end card, fade out. Capped lower when music leads. */
const oceanVolume = (f: number) => {
  const end = S.end;
  const v = interpolate(f, [0, 20, 90, 120, end, end + 20, MOTION_TOTAL - 30, MOTION_TOTAL], [0, 0.9, 0.9, 0.25, 0.25, 0.8, 0.8, 0], CLAMP);
  if (!generated.hasMusic) return v;
  return Math.min(v, interpolate(f, [0, 90, 120, end, end + 20, MOTION_TOTAL], [0.35, 0.35, 0.12, 0.12, 0.35, 0.35], CLAMP));
};

export const MotionPiece: React.FC<{layout: MotionLayout}> = ({layout: L}) => (
  <LayoutCtx.Provider value={L}>
    <AbsoluteFill style={{background: COLORS.navy1, overflow: 'hidden'}}>
      <Background cx={L.bg.cx} cy={L.bg.cy} compass={L.bg.compass} />
      {SCENE_ORDER.map(([k, start]) => {
        const end = sceneEnd(k);
        const lead = start === 0 ? 0 : OVERLAP;
        const tail = end >= MOTION_TOTAL ? 0 : OVERLAP;
        const Comp = SCENES[k];
        return (
          <Sequence key={k} from={start - lead} durationInFrames={end - start + lead + tail} layout="none">
            <LeadProvider value={lead}>
              <SceneFade lead={lead} tail={tail} dur={end - start}>
                <Comp />
              </SceneFade>
            </LeadProvider>
          </Sequence>
        );
      })}
      {SCENE_ORDER.filter(([, s]) => s > 0).map(([k, s]) => (k === 'end' ? null : <CutSweep key={k} at={s} L={L} />))}
      {(generated as {hasOcean?: boolean}).hasOcean && <Html5Audio src={staticFile('motion/ocean.mp3')} volume={oceanVolume} />}
      {generated.hasMusic && (
        <Html5Audio src={staticFile('music.mp3')} volume={(f) => interpolate(f, [0, 45, MOTION_TOTAL - 90, MOTION_TOTAL], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      )}
    </AbsoluteFill>
  </LayoutCtx.Provider>
);
