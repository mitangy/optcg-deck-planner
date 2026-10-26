import React from 'react';
import {Html5Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import generated from './generated.json';
import {Background} from './Background';
import {Eyebrow, Headline} from './Caption';
import {FocusClip} from './FocusClip';
import {BAR_H, BrowserFrame, PhoneFrame} from './Frame';
import {Intro} from './Intro';
import type {Layout} from './layout';
import {Logo} from './Logo';
import {OVERLAP, SceneLayer} from './SceneLayer';
import {CAPTIONS, END_CARD, FULL, SCENES} from './scenes.config';
import {BEAT, COLORS, FONT_SANS} from './theme';
import type {SceneDef} from './types';

const FRAME_IN = 36; // frame (30fps) at which the browser frame rises after the logo reveal

const endScene: SceneDef = {
  id: 'end', clip: END_CARD.desktop.clip, start: END_CARD.start, dur: END_CARD.dur, trimStart: END_CARD.desktop.trimStart,
  transition: 'fade', focus: [{at: 0, rect: END_CARD.desktop.focus}],
};
const ALL_SCENES = [...SCENES, endScene];

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Consecutive scenes with the same eyebrow become one run so the label doesn't restart on every cut. */
const eyebrowRuns = () => {
  const runs: {text: string; start: number; end: number}[] = [];
  for (const s of SCENES) {
    if (!s.eyebrow) continue;
    const last = runs[runs.length - 1];
    if (last && last.text === s.eyebrow && Math.abs(last.end - s.start) < 1e-6) last.end = s.start + s.dur;
    else runs.push({text: s.eyebrow, start: s.start, end: s.start + s.dur});
  }
  return runs;
};

export const TrailerComp: React.FC<{layout: Layout}> = ({layout: L}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const fw = L.frame.w;
  const fh = L.frame.h;
  const totalH = fh + BAR_H;
  const endF = Math.round(END_CARD.start * fps);

  // --- persistent browser frame: rises in, floats, punches on cuts, morphs to the end-card layout ---
  const appear = spring({frame: frame - FRAME_IN, fps, config: {damping: 18, stiffness: 70, mass: 1}});
  const appearO = clamp01((frame - FRAME_IN) / 10);
  const morph = spring({frame: frame - endF, fps, config: {damping: 22, stiffness: 60, mass: 1}});
  const mainCy = L.frame.top + totalH / 2;
  const endCy = L.end.desktop.top + (totalH * L.end.desktop.scale) / 2;
  const cutFrames = SCENES.map((s) => Math.round(s.start * fps)).filter((c) => c > 0);
  const sinceCut = Math.min(...cutFrames.map((c) => (frame >= c ? frame - c : 9999)));
  const punch = sinceCut < BEAT ? Math.pow(1 - sinceCut / BEAT, 3) : 0;
  const float = Math.sin(frame / 52) * 4 * (1 - morph);
  const frameCx = lerp(L.frame.cx, L.end.desktop.cx, morph);
  const frameCy = lerp(mainCy, endCy, morph) + (1 - appear) * 110 + float;
  const frameScale = lerp(1, L.end.desktop.scale, morph) * (0.93 + 0.07 * appear) * (1 + 0.007 * punch * (1 - morph));
  const rotY = Math.sin(frame / 95) * 1.1 * (1 - morph) + morph * 0;

  // --- music ---
  const fadeIn = fps * 1.5;
  const fadeOut = fps * 3;

  return (
    <div style={{position: 'absolute', inset: 0, background: COLORS.navy1, overflow: 'hidden'}}>
      <Background cx={frameCx} cy={frameCy} compass={L.compassR} />

      {generated.hasMusic && (
        <Html5Audio
          src={staticFile('music.mp3')}
          volume={(f) => interpolate(f, [0, fadeIn, durationInFrames - fadeOut, durationInFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
      )}

      <Intro cx={L.width / 2} cy={L.height / 2} />

      <div style={{position: 'absolute', inset: 0, perspective: 2600, opacity: appearO}}>
        <div
          style={{
            position: 'absolute', left: frameCx - fw / 2, top: frameCy - totalH / 2, width: fw, height: totalH,
            transform: `scale(${frameScale}) rotateY(${rotY}deg)`, transformOrigin: '50% 50%',
          }}
        >
          <BrowserFrame w={fw} h={fh}>
            {ALL_SCENES.map((s, i) => {
              const from = Math.round(s.start * fps);
              const hasNext = i < ALL_SCENES.length - 1;
              return (
                <Sequence key={s.id} from={from} durationInFrames={Math.round(s.dur * fps) + (hasNext ? OVERLAP : 0)} layout="none">
                  <SceneLayer scene={s} W={fw} H={fh} />
                </Sequence>
              );
            })}
          </BrowserFrame>
        </div>
      </div>

      {/* headline lines */}
      {CAPTIONS.map((c, i) => {
        const from = Math.round(c.start * fps);
        const dur = Math.round((c.end - c.start) * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <div style={{position: 'absolute', left: (L.width - L.headline.maxW) / 2, top: L.headline.top, width: L.headline.maxW, height: L.headline.height}}>
              <Headline words={c.words} durationInFrames={dur} size={L.headline.size} maxW={L.headline.maxW} boxH={L.headline.height} />
            </div>
          </Sequence>
        );
      })}
      {eyebrowRuns().map((r, i) => {
        const from = Math.round(r.start * fps) + 6;
        const dur = Math.round((r.end - r.start) * fps) - 6;
        return (
          <Sequence key={`e${i}`} from={from} durationInFrames={dur} layout="none">
            <div style={{position: 'absolute', top: L.eyebrow.top, left: 0, width: L.width}}>
              <Eyebrow text={r.text} durationInFrames={dur} size={L.eyebrow.size} width={L.width} />
            </div>
          </Sequence>
        );
      })}

      <Sequence from={endF} layout="none">
        <EndCard layout={L} />
      </Sequence>
    </div>
  );
};

const EndCard: React.FC<{layout: Layout}> = ({layout: L}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ph = L.end.phone;
  const phoneP = spring({frame: frame - 8, fps, config: {damping: 16, stiffness: 70, mass: 1}});
  const lockP = spring({frame: frame - 26, fps, config: {damping: 18, stiffness: 100}});
  const discO = interpolate(frame, [42, 60], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const float = Math.sin(frame / 40) * 5;
  const sheen = interpolate(frame, [30, 70], [-30, 130], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return (
    <>
      <div
        style={{
          position: 'absolute', left: ph.cx - (ph.w + 20) / 2, top: ph.top + (1 - phoneP) * 220 + float,
          opacity: clamp01(phoneP * 2), transform: `rotate(${ph.rot * phoneP}deg)`,
        }}
      >
        <PhoneFrame w={ph.w} h={ph.h}>
          <FocusClip clip={END_CARD.phone.clip} W={ph.w} H={ph.h} focus={[{at: 0, rect: END_CARD.phone.focus}]} trimStart={END_CARD.phone.trimStart} sceneFrames={END_CARD.dur * fps} />
        </PhoneFrame>
      </div>

      <div style={{position: 'absolute', left: (L.width - L.headline.maxW) / 2, top: L.end.headline.top, width: L.headline.maxW, height: L.end.headline.size * 1.2}}>
        <Headline words={END_CARD.headline} durationInFrames={100000} size={L.end.headline.size} maxW={L.headline.maxW} boxH={L.end.headline.size * 1.2} stagger={5} />
      </div>

      <div
        style={{
          position: 'absolute', left: 0, width: L.width, top: L.end.lockup.top, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22,
          opacity: clamp01(lockP * 1.5), transform: `translateY(${(1 - lockP) * 30}px)`,
        }}
      >
        <Logo size={L.end.lockup.size * 1.25} draw={1} id="endlogo" />
        <div
          style={{
            position: 'relative', fontFamily: FONT_SANS, fontWeight: 600, fontSize: L.end.lockup.size, letterSpacing: -0.5, color: COLORS.gold,
            padding: '6px 30px 10px', borderRadius: 999, border: `1.5px solid rgba(232,182,76,0.55)`, background: 'rgba(232,182,76,0.08)', overflow: 'hidden',
          }}
        >
          {END_CARD.url}
          <div style={{position: 'absolute', top: 0, bottom: 0, left: `${sheen}%`, width: '22%', transform: 'skewX(-20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,246,214,0.35), transparent)'}} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute', left: 0, width: L.width, top: L.end.disclaimer.top, textAlign: 'center', fontFamily: FONT_SANS, fontWeight: 400,
          fontSize: L.end.disclaimer.size, color: COLORS.muted, opacity: discO * 0.85, letterSpacing: 0.3, padding: '0 96px', boxSizing: 'border-box',
        }}
      >
        {END_CARD.disclaimer}
      </div>
    </>
  );
};
