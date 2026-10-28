import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Logo} from './Logo';
import {COLORS, FONT_DISPLAY, FONT_SANS} from './theme';

/** Logo reveal over the bare gradient. Local frame 0 = trailer start. ~1.5s. */
export const Intro: React.FC<{cx: number; cy: number}> = ({cx, cy}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const draw = interpolate(frame, [2, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const pop = spring({frame: frame - 2, fps, config: {damping: 16, stiffness: 120, mass: 0.8}});
  const ring = interpolate(frame, [16, 44], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const word = interpolate(frame, [14, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const out = interpolate(frame, [24, 38], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  if (out >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute', left: cx, top: cy, width: 0, height: 0, opacity: 1 - out,
        transform: `scale(${1 + out * 0.25})`, filter: out > 0 ? `blur(${out * 14}px)` : undefined,
      }}
    >
      <div style={{position: 'absolute', left: -150, top: -230, width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.7 + pop * 0.3})`}}>
        <div
          style={{
            position: 'absolute', width: 300, height: 300, borderRadius: '50%', border: `2px solid ${COLORS.gold}`,
            opacity: (1 - ring) * 0.7, transform: `scale(${0.5 + ring * 1.1})`,
          }}
        />
        <Logo size={230} draw={draw} />
      </div>
      <div style={{position: 'absolute', left: -600, top: 90, width: 1200, textAlign: 'center', opacity: word, filter: `blur(${(1 - word) * 10}px)`}}>
        <span style={{fontFamily: FONT_SANS, fontWeight: 300, fontSize: 64, color: COLORS.ink, letterSpacing: `${0.9 - word * 0.5}em`, marginRight: `-${0.9 - word * 0.5}em`}}>OPTCG</span>
        <span style={{fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 72, color: COLORS.goldBright, marginLeft: 26}}>Duel</span>
      </div>
    </div>
  );
};
