import React from 'react';
import {Img, staticFile} from 'remotion';
import {COLORS, FONT_DISPLAY, FONT_SANS} from '../theme';
import boxes from './boxes.json';

export type Rect = {x: number; y: number; w: number; h: number};

/** Size of each screenshot in CSS px (the PNGs are 2x desktop, 3x phone). */
export const SRC = {desktop: {w: 1440, h: 900}, compact: {w: 1040, h: 700}, phone: {w: 390, h: 844}} as const;
export type Kind = keyof typeof SRC;

const B = boxes as Record<string, Record<string, Rect>>;
export const boxOf = (shot: string, key: string): Rect => {
  const b = B[shot]?.[key];
  if (!b) throw new Error(`infographics: no box "${key}" recorded for shot "${shot}" (run npm run infographics:shots)`);
  return b;
};

export const union = (rs: Rect[]): Rect => {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};

export type RingSpec = {
  /** Recorded control(s) to circle. */
  k: string | string[];
  pad?: number;
  radius?: number;
  /** Dim everything outside this ring. */
  spot?: boolean;
  /** Arrow pointing at the ring from this side, with an optional label at its tail. */
  arrow?: 'up' | 'down' | 'left' | 'right';
  label?: string;
};

export type ShotSpec = {
  src: string;
  kind: Kind;
  /** Controls the crop must contain (recorded boxes). */
  focus?: string[];
  /** Explicit crop in CSS px, instead of focus. */
  rect?: Rect;
  /** Stay inside this recorded box (a dialog panel), so the crop never shows the dimmed page behind it. */
  inside?: string;
  /** Padding around the focus box, CSS px (one number or [left, top, right, bottom]). */
  pad?: number | [number, number, number, number];
  /** Crop aspect (w / h); the crop grows to it. */
  ar?: number;
  rings?: RingSpec[];
  /** Portrait: ride on the first picture as an inset (phone pictures after a desktop one always do). */
  inset?: boolean;
  /** Portrait: which corner of the picture a phone inset sits in (default bottom right). */
  at?: 'tl' | 'tr' | 'bl' | 'br';
  /** Small pill on the crop, e.g. "Phone". */
  tag?: string;
};

export type Step = {
  text: string;
  keys?: string[];
  shots?: ShotSpec[];
  /** Big keycaps or a link chip filling the picture area when there is no screenshot. */
  bigKeys?: string[];
  chip?: string;
};

export type InfographicSpec = {
  id: string;
  title: string;
  subtitle: string;
  steps: Step[];
  tip?: string;
};

export function resolveCrop(s: ShotSpec): Rect {
  const src = SRC[s.kind];
  const bounds: Rect = s.inside ? boxOf(s.src, s.inside) : {x: 0, y: 0, w: src.w, h: src.h};
  let c: Rect;
  if (s.rect) c = {...s.rect};
  else {
    const focus = s.focus ?? s.rings?.flatMap((r) => (Array.isArray(r.k) ? r.k : [r.k])) ?? [];
    const u = union(focus.map((k) => boxOf(s.src, k)));
    const [l, t, r, b] = Array.isArray(s.pad) ? s.pad : [s.pad ?? 36, s.pad ?? 36, s.pad ?? 36, s.pad ?? 36];
    c = {x: u.x - l, y: u.y - t, w: u.w + l + r, h: u.h + t + b};
  }
  if (s.ar) {
    const cur = c.w / c.h;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (cur < s.ar) c.w = c.h * s.ar;
    else c.h = c.w / s.ar;
    c.x = cx - c.w / 2;
    c.y = cy - c.h / 2;
  }
  // Keep inside the bounds: shrink (same aspect) to fit, then shift.
  const k = Math.min(1, bounds.w / c.w, bounds.h / c.h);
  if (k < 1) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    c.w *= k;
    c.h *= k;
    c.x = cx - c.w / 2;
    c.y = cy - c.h / 2;
  }
  c.x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - c.w, c.x));
  c.y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - c.h, c.y));
  return c;
}

export const aspectOf = (s: ShotSpec) => {
  const c = resolveCrop(s);
  return c.w / c.h;
};

export type Size = {w: number; h: number};

export function fitRow(aspects: number[], W: number, H: number, gap: number): Size[] {
  const sum = aspects.reduce((a, b) => a + b, 0);
  const h = Math.min(H, (W - gap * (aspects.length - 1)) / sum);
  return aspects.map((a) => ({w: a * h, h}));
}

export function fitCol(aspects: number[], W: number, H: number, gap: number): Size[] {
  const sum = aspects.reduce((a, b) => a + 1 / b, 0);
  const w = Math.min(W, (H - gap * (aspects.length - 1)) / sum);
  return aspects.map((a) => ({w, h: w / a}));
}

const area = (s: Size[]) => s.reduce((a, b) => a + b.w * b.h, 0);

/** Row or column, whichever gives the pictures more room. */
export function fitBest(aspects: number[], W: number, H: number, gap: number): {dir: 'row' | 'col'; sizes: Size[]} {
  if (aspects.length === 1) return {dir: 'row', sizes: fitRow(aspects, W, H, gap)};
  const row = fitRow(aspects, W, H, gap);
  const col = fitCol(aspects, W, H, gap);
  return area(row) >= area(col) ? {dir: 'row', sizes: row} : {dir: 'col', sizes: col};
}

/** Gold, with a dark halo so it reads on both bright card art and dark panels. */
export const GOLD = COLORS.gold;

const Arrow: React.FC<{ring: Rect; side: 'up' | 'down' | 'left' | 'right'; label?: string; unit: number}> = ({ring, side, label, unit}) => {
  const len = 64 * unit;
  const head = 15 * unit;
  const gap = 6 * unit;
  const cx = ring.x + ring.w / 2;
  const cy = ring.y + ring.h / 2;
  // Tip touches the ring edge (with a gap); tail extends away from it.
  // `side` is where the arrow sits relative to the ring; it points at the ring.
  const dir = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]}[side];
  const tipX = side === 'right' ? ring.x + ring.w + gap : side === 'left' ? ring.x - gap : cx;
  const tipY = side === 'down' ? ring.y + ring.h + gap : side === 'up' ? ring.y - gap : cy;
  const tailX = tipX + dir[0] * len;
  const tailY = tipY + dir[1] * len;
  const ang = Math.atan2(tipY - tailY, tipX - tailX);
  const hx = (a: number) => tipX - Math.cos(ang + a) * head * 1.5;
  const hy = (a: number) => tipY - Math.sin(ang + a) * head * 1.5;
  const sw = 7 * unit;
  return (
    <>
      <svg style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none'}}>
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d={`M ${tailX} ${tailY} L ${tipX} ${tipY} M ${hx(0.5)} ${hy(0.5)} L ${tipX} ${tipY} L ${hx(-0.5)} ${hy(-0.5)}`} stroke="rgba(5,11,29,0.85)" strokeWidth={sw + 5 * unit} />
          <path d={`M ${tailX} ${tailY} L ${tipX} ${tipY} M ${hx(0.5)} ${hy(0.5)} L ${tipX} ${tipY} L ${hx(-0.5)} ${hy(-0.5)}`} stroke={GOLD} strokeWidth={sw} />
        </g>
      </svg>
      {label ? (
        <div
          style={{
            position: 'absolute', left: tailX, top: tailY, transform: `translate(${side === 'left' ? 'calc(-100% - 4px)' : side === 'right' ? '4px' : '-50%'}, ${side === 'down' ? '4px' : side === 'up' ? 'calc(-100% - 4px)' : '-50%'})`,
            background: GOLD, color: COLORS.navy0, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 19 * unit, padding: `${5 * unit}px ${12 * unit}px`, borderRadius: 999, whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
};

/** One cropped screenshot at (w x h) px, with its gold rings and arrows. */
export const Shot: React.FC<{spec: ShotSpec; w: number; h: number}> = ({spec, w, h}) => {
  const crop = resolveCrop(spec);
  const src = SRC[spec.kind];
  const k = w / crop.w;
  // Rings keep a steady weight whatever the zoom.
  const unit = Math.max(0.8, Math.min(1.5, k / 1.6));
  const rings = (spec.rings ?? []).map((r) => {
    const keys = Array.isArray(r.k) ? r.k : [r.k];
    const u = union(keys.map((key) => boxOf(spec.src, key)));
    const pad = r.pad ?? 7;
    return {r, rect: {x: (u.x - pad - crop.x) * k, y: (u.y - pad - crop.y) * k, w: (u.w + pad * 2) * k, h: (u.h + pad * 2) * k}};
  });
  return (
    <div
      style={{
        position: 'relative', width: w, height: h, borderRadius: 16, overflow: 'hidden', background: COLORS.navy0, flex: 'none',
        border: '1.5px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 40px -14px rgba(0,0,0,0.7)',
      }}
    >
      <Img src={staticFile(`infographics/shots/${spec.src}.png`)} style={{position: 'absolute', left: -crop.x * k, top: -crop.y * k, width: src.w * k, height: src.h * k, maxWidth: 'none'}} />
      {rings.map(({r, rect}, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: 'border-box',
              borderRadius: Math.min((r.radius ?? 14) * k, rect.h / 2 + 4), border: `${4.5 * unit}px solid ${GOLD}`,
              boxShadow: `0 0 0 ${2.5 * unit}px rgba(5,11,29,0.7), 0 0 ${22 * unit}px rgba(232,182,76,0.65)${r.spot ? ', 0 0 0 4000px rgba(5,11,29,0.55)' : ''}`,
            }}
          />
          {r.arrow ? <Arrow ring={rect} side={r.arrow} label={r.label} unit={unit} /> : null}
        </React.Fragment>
      ))}
      {spec.tag ? (
        <div
          style={{
            position: 'absolute', left: 8, top: 8, background: 'rgba(5,11,29,0.82)', color: COLORS.goldBright, fontFamily: FONT_SANS, fontWeight: 600,
            fontSize: Math.max(11, Math.min(16, w / 24)), letterSpacing: 1, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(232,182,76,0.5)',
          }}
        >
          {spec.tag}
        </div>
      ) : null}
    </div>
  );
};

export const Key: React.FC<{children: React.ReactNode; size?: number}> = ({children, size = 30}) => (
  <span
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: size * 1.5, height: size * 1.45, padding: `0 ${size * 0.45}px`, boxSizing: 'border-box',
      borderRadius: size * 0.3, background: 'linear-gradient(#f7f0de, #d9cfb4)', color: COLORS.navy0, fontFamily: FONT_SANS, fontWeight: 700, fontSize: size,
      boxShadow: `0 ${size * 0.14}px 0 #8f845f, 0 ${size * 0.3}px ${size * 0.5}px rgba(0,0,0,0.5)`, marginBottom: size * 0.14,
    }}
  >
    {children}
  </span>
);

/** "**gold**" spans in a step's text. */
export const Rich: React.FC<{text: string}> = ({text}) => (
  <>
    {text.split('**').map((part, i) =>
      i % 2 ? (
        <span key={i} style={{color: COLORS.goldBright, fontWeight: 700}}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

export const NumberBadge: React.FC<{n: number; size: number}> = ({n, size}) => (
  <div
    style={{
      width: size, height: size, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(145deg, ${COLORS.goldBright}, ${COLORS.gold} 55%, ${COLORS.goldDeep})`, color: COLORS.navy0,
      fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: size * 0.62, boxShadow: '0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
    }}
  >
    {n}
  </div>
);
