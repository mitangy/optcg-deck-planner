import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_SANS} from './theme';
import type {CaptionWord} from './types';

const EXIT = 9;

const emStyle: React.CSSProperties = {
  fontWeight: 700,
  background: `linear-gradient(180deg, ${COLORS.goldBright} 0%, ${COLORS.gold} 55%, ${COLORS.goldDeep} 100%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
};

/** Kinetic headline: words slide up and de-blur on a stagger, then lift away. Time is local (use inside a <Sequence>). */
export const Headline: React.FC<{words: CaptionWord[]; durationInFrames: number; size: number; maxW: number; boxH: number; align?: 'center' | 'left'; stagger?: number}> = ({
  words, durationInFrames, size, maxW, boxH, align = 'center', stagger = 3,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const flat = words.flatMap((w) => w.t.split(' ').map((t, i, a) => ({t, em: !!w.em, br: !!w.br && i === a.length - 1})));
  const e = interpolate(frame, [durationInFrames - EXIT, durationInFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  return (
    <div style={{position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: maxW, height: boxH, display: 'flex', alignItems: 'flex-end', justifyContent: align === 'center' ? 'center' : 'flex-start'}}>
      <div
        style={{
          fontFamily: FONT_SANS, fontSize: size, lineHeight: 1.12, fontWeight: 300, color: COLORS.ink, letterSpacing: -size * 0.018,
          textAlign: align, opacity: 1 - e, transform: `translateY(${-e * 18}px)`, filter: e > 0 ? `blur(${e * 10}px)` : undefined,
          textShadow: '0 4px 30px rgba(3,8,20,0.55)', whiteSpace: 'normal',
        }}
      >
        {flat.map((w, i) => {
          const p = spring({frame: frame - i * stagger, fps, config: {damping: 20, stiffness: 110, mass: 0.9}});
          const blur = (1 - p) * 16;
          const span = (
            <span
              key={i}
              style={{
                display: 'inline-block', marginRight: i < flat.length - 1 && !w.br ? size * 0.26 : 0, opacity: Math.min(1, p * 1.6),
                transform: `translateY(${(1 - p) * 46}px)`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
                ...(w.em ? emStyle : {}),
              }}
            >
              {w.t}
            </span>
          );
          return w.br ? <React.Fragment key={i}>{span}<br /></React.Fragment> : span;
        })}
      </div>
    </div>
  );
};

/** Small tracked caps line that sits with the headline. */
export const Eyebrow: React.FC<{text: string; durationInFrames: number; size: number; width: number}> = ({text, durationInFrames, size, width}) => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const outP = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', easing: Easing.in(Easing.cubic)});
  const o = Math.min(inP, outP);
  return (
    <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)', width, textAlign: 'center'}}>
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 16, fontFamily: FONT_SANS, fontSize: size, fontWeight: 600, letterSpacing: size * 0.22,
          textTransform: 'uppercase', color: COLORS.gold, opacity: o, transform: `translateY(${(1 - o) * 10}px)`, filter: o < 0.99 ? `blur(${(1 - o) * 6}px)` : undefined,
        }}
      >
        <span style={{width: 36, height: 2, background: COLORS.gold, opacity: 0.6}} />
        {text}
        <span style={{width: 36, height: 2, background: COLORS.gold, opacity: 0.6}} />
      </div>
    </div>
  );
};
