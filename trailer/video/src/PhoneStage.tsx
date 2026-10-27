import React from 'react';
import {Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {FocusClip} from './FocusClip';
import {PhoneFrame} from './Frame';
import type {Layout} from './layout';
import {PHONE} from './scenes.config';
import {COLORS, FONT_SANS} from './theme';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => Easing.inOut(Easing.cubic)(clamp01(v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** 0 = browser frame shown, 1 = phone shown: the 0.5s hand-off at both ends of the phone section (frame units). */
export const phoneHandoff = (frame: number, fps: number): number => {
  const hf = Math.round(PHONE.handoff * fps);
  const a = ease((frame - PHONE.start * fps) / hf);
  const b = ease((frame - PHONE.end * fps) / hf);
  return a * (1 - b);
};

const HomeChip: React.FC<{x: number; y: number; frame: number; fps: number}> = ({x, y, frame, fps}) => {
  const {from, to, label, sub} = PHONE.homeScreen;
  const inP = spring({frame: frame - from * fps, fps, config: {damping: 18, stiffness: 110}});
  const outP = ease((frame - (to - 0.4) * fps) / (0.4 * fps));
  const o = clamp01(inP * 1.4) * (1 - outP);
  if (o <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, opacity: o, transform: `translateY(${(1 - inP) * 24 - outP * 10}px) scale(${0.96 + 0.04 * inP})`,
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px 14px 16px', borderRadius: 22,
        background: 'linear-gradient(180deg, rgba(20,35,64,0.92), rgba(11,22,48,0.92))', border: '1.5px solid rgba(232,182,76,0.55)',
        boxShadow: '0 24px 50px -12px rgba(0,0,0,0.6), 0 0 40px rgba(232,182,76,0.12)', fontFamily: FONT_SANS,
      }}
    >
      <div style={{width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(160deg, #1b3d63, #0b1630)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </div>
      <div>
        <div style={{fontSize: 26, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2}}>{label}</div>
        <div style={{fontSize: 18, fontWeight: 400, color: COLORS.muted, marginTop: 2}}>{sub}</div>
      </div>
    </div>
  );
};

/**
 * The big phone: rises in as the browser frame gives way, plays the portrait take, then turns 90 degrees
 * (spring) while the footage crossfades to the landscape take, then lowers away as the browser frame returns.
 */
export const PhoneStage: React.FC<{layout: Layout}> = ({layout: L}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sh = L.phone.h;
  const sw = Math.round((sh * 750) / 1624);
  const startF = Math.round(PHONE.start * fps);
  const endF = Math.round(PHONE.end * fps);
  const turnF = Math.round(PHONE.turnAt * fps);
  const hf = Math.round(PHONE.handoff * fps);
  if (frame < startF - 1 || frame > endF + hf + 1) return null;

  const rise = spring({frame: frame - startF, fps, config: {damping: 20, stiffness: 80, mass: 1}});
  const fall = ease((frame - endF) / hf);
  const rot = spring({frame: frame - turnF, fps, config: {damping: 15, stiffness: 64, mass: 1}});
  const xf = ease((frame - turnF) / hf); // footage crossfade, over the first beat of the turn
  const h = phoneHandoff(frame, fps);
  const o = clamp01((h - 0.3) / 0.7); // appears after the browser frame has mostly gone, so the two never mix into mud
  const push = 1 + 0.04 * ease((frame - startF) / (turnF - startF)); // slow push-in while the portrait take plays
  const scale = lerp(0.9, 1, rise) * push * lerp(1, L.phone.landscapeScale, rot) * lerp(1, 0.92, fall);
  const dy = (1 - rise) * 120 + fall * 40;
  const float = Math.sin(frame / 50) * 3 * (1 - fall);
  const pad = 10;

  const portraitStart = startF;
  const landStart = turnF;
  const portraitFrames = turnF + hf - portraitStart;
  const landFrames = endF - landStart;

  return (
    <div style={{position: 'absolute', inset: 0, opacity: o}}>
      <div
        style={{
          position: 'absolute', left: L.phone.cx - (sw + 2 * pad) / 2, top: L.phone.cy - (sh + 2 * pad) / 2 + dy + float,
          transform: `rotate(${-90 * rot}deg) scale(${scale})`, transformOrigin: '50% 50%',
        }}
      >
        <PhoneFrame w={sw} h={sh} island={1 - clamp01(rot * 3)}>
          <Sequence from={portraitStart} durationInFrames={portraitFrames} layout="none">
            <div style={{position: 'absolute', inset: 0, opacity: 1 - xf}}>
              <FocusClip
                clip={PHONE.portrait.clip} W={sw} H={sh} focus={PHONE.portrait.focus} trimStart={PHONE.portrait.trimStart}
                rate={PHONE.portrait.rate} sceneFrames={portraitFrames}
              />
            </div>
          </Sequence>
          {frame >= landStart - 1 && (
            <Sequence from={landStart} durationInFrames={landFrames + hf} layout="none">
              {/* the landscape take lives sideways in the portrait device box, so turning the device brings it upright */}
              <div
                style={{
                  position: 'absolute', left: (sw - sh) / 2, top: (sh - sw) / 2, width: sh, height: sw, opacity: xf,
                  transform: 'rotate(90deg)', transformOrigin: '50% 50%',
                }}
              >
                <FocusClip
                  clip={PHONE.landscape.clip} W={sh} H={sw} focus={PHONE.landscape.focus} trimStart={PHONE.landscape.trimStart}
                  rate={PHONE.landscape.rate} sceneFrames={landFrames}
                />
              </div>
            </Sequence>
          )}
        </PhoneFrame>
      </div>
      <HomeChip x={L.phone.cx + sw / 2 + 80} y={L.phone.cy - 150} frame={frame} fps={fps} />
    </div>
  );
};
