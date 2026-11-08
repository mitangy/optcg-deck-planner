import React, {createContext, useContext} from 'react';
import {Easing, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, FONT_SANS} from '../theme';
import type {MotionLayout} from './layout';
import {OVERLAP} from './timing';

export const LayoutCtx = createContext<MotionLayout | null>(null);
export const useL = () => {
  const l = useContext(LayoutCtx);
  if (!l) throw new Error('no layout');
  return l;
};
/** frames the current scene was started early (0 for the very first scene) */
const LeadCtx = createContext(0);
export const LeadProvider = LeadCtx.Provider;
/** frame counted from the scene's nominal start (negative during the lead-in overlap) */
export const useScene = () => useCurrentFrame() - useContext(LeadCtx);

export const M = (f: string) => staticFile(`motion/${f}`);
export const CARD_AR = 63 / 88;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
/** 0..1 eased progress between two frames */
export const prog = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e});
export const sp = (f: number, start: number, cfg: {damping?: number; stiffness?: number; mass?: number} = {}) =>
  spring({frame: f - start, fps: 30, config: {damping: 16, stiffness: 120, mass: 0.9, ...cfg}});

export const Card: React.FC<{src: string; h: number; style?: React.CSSProperties; glow?: boolean}> = ({src, h, style, glow}) => (
  <div
    style={{
      width: h * CARD_AR, height: h, borderRadius: h * 0.045, overflow: 'hidden', position: 'absolute',
      boxShadow: glow ? `0 0 0 3px ${COLORS.gold}, 0 30px 70px rgba(0,0,0,0.55), 0 0 90px rgba(232,182,76,0.35)` : '0 30px 70px rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.4)',
      background: '#111', ...style,
    }}
  >
    <img src={M(src)} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
  </div>
);

export const Gold: React.CSSProperties = {color: COLORS.gold};
export const display = (size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: size, color: COLORS.ink, lineHeight: 1, letterSpacing: '-0.01em',
  textShadow: '0 6px 40px rgba(0,0,0,0.45)', ...extra,
});
export const sans = (size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontFamily: FONT_SANS, fontWeight: 500, fontSize: size, color: COLORS.ink, lineHeight: 1.15, ...extra,
});

/** Centre-anchored absolute box */
export const At: React.FC<{x: number; y: number; w?: number; h?: number; style?: React.CSSProperties; children: React.ReactNode}> = ({x, y, w = 0, h = 0, style, children}) => (
  <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w || undefined, height: h || undefined, ...style}}>{children}</div>
);

/** Scene fades in over the overlap and out over the next one's overlap; tiny scale breathing for depth */
export const SceneFade: React.FC<{lead: number; tail: number; dur: number; children: React.ReactNode}> = ({lead, tail, dur, children}) => {
  const f = useCurrentFrame();
  const a = lead ? prog(f, 0, lead, Easing.linear) : 1;
  const b = tail ? 1 - prog(f, lead + dur, lead + dur + tail, Easing.linear) : 1;
  const sIn = lead ? lerp(0.97, 1, prog(f, 0, lead * 1.5)) : 1;
  const sOut = tail ? lerp(1, 1.03, prog(f, lead + dur, lead + dur + tail, Easing.linear)) : 1;
  return <div style={{position: 'absolute', inset: 0, opacity: Math.min(a, b), transform: `scale(${sIn * sOut})`}}>{children}</div>;
};
export {OVERLAP};
