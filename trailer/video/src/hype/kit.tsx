import React, {createContext, useContext} from 'react';
import {Easing, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, Sequence} from 'remotion';
import {BODY, CLIPS, COLORS, FPS, HEAD, NUM, sec, type ClipId, type HypeLayout} from './theme';

export const LayoutCtx = createContext<HypeLayout | null>(null);
/** Duration (frames) of the scene being rendered, so captions can ease out before the cut. */
export const SceneCtx = createContext<number>(0);
export const useHL = () => {
  const l = useContext(LayoutCtx);
  if (!l) throw new Error('no hype layout');
  return l;
};

const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const prog = (f: number, a: number, b: number, easing = Easing.bezier(0.22, 1, 0.36, 1)) => interpolate(f, [a, b], [0, 1], {...CLAMP, easing});
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const pop = (f: number, start: number, cfg: {damping?: number; stiffness?: number} = {}) =>
  spring({frame: f - start, fps: FPS, config: {damping: 14, stiffness: 170, mass: 0.8, ...cfg}});

const shadow = '0 6px 40px rgba(3,8,20,0.55)';

/* ---------- text ---------- */

export type Part = string | {t: string; gold?: boolean; strike?: number; small?: boolean};
const partOf = (p: Part) => (typeof p === 'string' ? {t: p} : p);

/** One line of kinetic type: words pop in with a stagger (in frames), optionally struck through at frame `strike`. */
export const Line: React.FC<{parts: Part[]; size: number; delay?: number; stagger?: number; weight?: number; font?: string; align?: 'center' | 'left'; maxW?: number; color?: string; out?: number}> = ({
  parts, size, delay = 0, stagger = 4, weight = 800, font = HEAD, align = 'center', maxW, color = COLORS.ink, out,
}) => {
  const f = useCurrentFrame();
  const words = parts.flatMap((p) => {
    const o = partOf(p);
    return o.t.split(' ').filter(Boolean).map((w) => ({...o, t: w}));
  });
  // A '\n' part forces a line break, so captions balance as authored ("Ours tells you / why you lost.").
  const fade = out === undefined ? 1 : 1 - prog(f, out, out + 5, Easing.in(Easing.quad));
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', columnGap: size * 0.26, rowGap: size * 0.04, maxWidth: maxW, opacity: fade, fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.015em', color, textShadow: shadow, textAlign: align}}>
      {words.map((w, i) => {
        if (w.t === '\n') return <div key={i} style={{flexBasis: '100%', height: 0}} />;
        const p = pop(f, delay + i * stagger);
        const gold = w.gold
          ? {background: `linear-gradient(180deg, ${COLORS.goldBright} 0%, ${COLORS.gold} 55%, ${COLORS.goldDeep} 100%)`, WebkitBackgroundClip: 'text' as const, backgroundClip: 'text' as const, color: 'transparent', WebkitTextFillColor: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.45))'}
          : null;
        return (
          <span key={i} style={{position: 'relative', display: 'inline-block', opacity: Math.min(1, p * 1.8), transform: `translateY(${(1 - p) * size * 0.5}px) scale(${lerp(0.82, 1, Math.min(1, p))})`, filter: p < 1 ? `blur(${(1 - Math.min(1, p)) * 8}px)` : undefined, fontSize: w.small ? size * 0.6 : undefined, ...gold}}>
            {w.t}
            {w.strike !== undefined && (
              <span style={{position: 'absolute', left: -size * 0.08, top: '54%', height: Math.max(8, size * 0.1), width: `${prog(f, w.strike + i * 2, w.strike + i * 2 + 6) * 116}%`, background: '#ff5d4d', borderRadius: 6, boxShadow: '0 0 24px rgba(255,93,77,0.6)', transform: 'rotate(-3deg)'}} />
            )}
          </span>
        );
      })}
    </div>
  );
};

/** A stack of lines in the safe band, vertically centred. */
export const Stack: React.FC<{children: React.ReactNode; gap?: number; y?: number; h?: number}> = ({children, gap = 28, y, h}) => {
  const L = useHL();
  const top = y ?? L.top;
  return (
    <div style={{position: 'absolute', left: L.vertical ? 60 : 160, right: L.vertical ? 60 : 160, top, height: h ?? L.bottom - top, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap}}>{children}</div>
  );
};

export const Eyebrow: React.FC<{text?: string; y?: number; until?: number}> = ({text = 'Unofficial fan-made sim', y, until}) => {
  const f = useCurrentFrame();
  const L = useHL();
  const a = prog(f, 3, 12) * (until === undefined ? 1 : 1 - prog(f, until, until + 6));
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: y ?? (L.vertical ? L.top + 14 : 70), display: 'flex', justifyContent: 'center', opacity: a, transform: `translateY(${(1 - a) * -14}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '12px 30px', borderRadius: 999, border: `2px solid rgba(232,182,76,0.55)`, background: 'rgba(11,22,48,0.72)', fontFamily: BODY, fontWeight: 600, fontSize: L.vertical ? 34 : 28, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.goldBright}}>
        <span style={{width: 12, height: 12, borderRadius: 99, background: COLORS.gold, boxShadow: '0 0 14px rgba(232,182,76,0.9)'}} />
        {text}
      </div>
    </div>
  );
};

export const Chip: React.FC<{text: string; start: number; size?: number; check?: boolean; end?: number}> = ({text, start, size = 48, check = true, end}) => {
  const f = useCurrentFrame();
  const ex = end === undefined ? 0 : prog(f, end, end + 5, Easing.in(Easing.quad));
  const p = pop(f, start, {damping: 11, stiffness: 200});
  const settle = prog(f, start + 6, start + 20);
  return (
    <div style={{display: 'inline-flex', alignItems: 'center', gap: size * 0.4, padding: `${size * 0.36}px ${size * 0.7}px`, borderRadius: 999, background: 'linear-gradient(180deg, rgba(20,44,84,0.96), rgba(11,22,48,0.96))', border: `2px solid ${COLORS.gold}`, boxShadow: `0 14px 50px rgba(0,0,0,0.5), 0 0 ${lerp(60, 24, settle)}px rgba(232,182,76,${lerp(0.55, 0.2, settle)})`, fontFamily: BODY, fontWeight: 600, fontSize: size, color: COLORS.ink, opacity: Math.min(1, p * 2) * (1 - ex), transform: `translateY(${(1 - Math.min(1, p)) * 70 - ex * 20}px) scale(${lerp(0.7, 1, Math.min(1.08, p))})`, whiteSpace: 'nowrap'}}>
      {check && (
        <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={COLORS.gold} /><path d="M6.8 12.4l3.4 3.5 7-7.6" fill="none" stroke={COLORS.navy0} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
      {text}
    </div>
  );
};

/** Big caption under (or beside) a frame. */
export const Caption: React.FC<{text: Part[]; delay?: number; size?: number; out?: number}> = ({text, delay = 0, size, out}) => {
  const L = useHL();
  return (
    <Line parts={text} size={size ?? (L.vertical ? 92 : 76)} delay={delay} stagger={2} align={L.vertical ? 'center' : 'left'} maxW={L.vertical ? 980 : 560} out={out} />
  );
};

/* ---------- footage ---------- */

export type Part_ = {clip: ClipId; from: number; dur: number; zoom?: number; zoomTo?: number; fx?: number; fy?: number; fxTo?: number; fyTo?: number; rate?: number; allowShort?: boolean};
/** One continuous camera for a whole Frame/Backdrop: the move carries across part cuts instead of restarting. */
export type Cam = {zoom: number; zoomTo?: number; fx?: number; fy?: number; fxTo?: number; fyTo?: number};

/** Crossfade between parts, in frames (0.27 s): a cut becomes a short dissolve and each luminance step is spread over 8 frames. */
export const XF = 8;
/** The last part keeps playing this long past its nominal end, so the scene dissolve (6 frames) never reveals an empty frame underneath. */
const TAIL = 8;

const checkHold = (parts: Part_[]) => {
  if (parts.some((q) => q.dur < 1.0 && !q.allowShort)) throw new Error(`part < 1 s: ${parts.map((q) => q.dur).join(',')}`);
};

const Shot: React.FC<{p: Part_; w: number; h: number; lead: number; cam?: Cam; camT: number}> = ({p, w, h, lead, cam, camT}) => {
  const f = useCurrentFrame();
  const info = CLIPS[p.clip];
  const t = cam ? camT : prog(f - lead, 0, sec(p.dur), Easing.inOut(Easing.quad));
  const src = cam ? {zoom: cam.zoom, zoomTo: cam.zoomTo, fx: cam.fx ?? p.fx, fy: cam.fy ?? p.fy, fxTo: cam.fxTo, fyTo: cam.fyTo} : p;
  const zoom = lerp(src.zoom ?? 1, src.zoomTo ?? src.zoom ?? 1, t);
  const dfx = src.fx ?? info.fx ?? 0.5;
  const fx = lerp(dfx, src.fxTo ?? dfx, t);
  const dfy = src.fy ?? 0.5;
  const fy = lerp(dfy, src.fyTo ?? dfy, t);
  // "cover" the frame, then zoom and keep the focus point near the middle
  const base = Math.max(w / info.w, h / info.h);
  const vw = info.w * base * zoom;
  const vh = info.h * base * zoom;
  const left = Math.min(0, Math.max(w - vw, w / 2 - fx * vw));
  const top = Math.min(0, Math.max(h - vh, h / 2 - fy * vh));
  return (
    <OffthreadVideo src={staticFile(`hype/clips/${info.file}`)} muted trimBefore={Math.max(0, sec(p.from) - lead)} playbackRate={p.rate ?? 1} style={{position: 'absolute', left, top, width: vw, height: vh}} />
  );
};

/** Parts i>0 start XF frames early and fade in over the previous part; their capture time is trimmed back so the content at the nominal cut is unchanged. */
const XfadeLayer: React.FC<{i: number; children: React.ReactNode}> = ({i, children}) => {
  const f = useCurrentFrame();
  const o = i === 0 ? 1 : prog(f, 0, XF, Easing.inOut(Easing.quad));
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: o}}>{children}</div>;
};

const Parts: React.FC<{parts: Part_[]; w: number; h: number; cam?: Cam}> = ({parts, w, h, cam}) => {
  const f = useCurrentFrame();
  checkHold(parts);
  let acc = 0;
  const starts = parts.map((q) => { const s = acc; acc += sec(q.dur); return s; });
  const camT = prog(f, 0, acc, Easing.inOut(Easing.sin));
  return (
    <>
      {parts.map((q, i) => {
        const lead = i === 0 ? 0 : XF;
        return (
          <Sequence key={i} from={starts[i] - lead} durationInFrames={sec(q.dur) + lead + (i === parts.length - 1 ? TAIL : 0)} layout="none">
            <XfadeLayer i={i}><Shot p={q} w={w} h={h} lead={lead} cam={cam} camT={camT} /></XfadeLayer>
          </Sequence>
        );
      })}
    </>
  );
};

/** A rounded browser/phone frame around live captures. `parts` dissolve into each other over XF frames (no flashes: rapid full-frame flashes are a seizure risk). `enter` <= -40 means the frame is already on screen. */
export const Frame: React.FC<{parts: Part_[]; w: number; h?: number; kind?: 'browser' | 'phone'; x?: number; y?: number; tilt?: number; enter?: number; cam?: Cam}> = ({parts, w, h, kind = 'browser', x, y, tilt = 0, enter = -3, cam}) => {
  const f = useCurrentFrame();
  const L = useHL();
  const info = CLIPS[parts[0].clip];
  const bar = kind === 'browser' ? Math.round(w * 0.06) : 0;
  const bez = kind === 'phone' ? Math.round(w * 0.035) : 0;
  const innerW = w - bez * 2;
  const innerH = h !== undefined ? h - bar - bez * 2 : Math.round((innerW * info.h) / info.w);
  const H = innerH + bar + bez * 2;
  const p = pop(f, enter, {damping: 16, stiffness: 130});
  const cx = x ?? (L.W - w) / 2;
  const cy = y ?? (L.vertical ? 350 : (L.H - H) / 2);
  const radius = kind === 'phone' ? w * 0.12 : 28;
  return (
    <div style={{position: 'absolute', left: cx, top: cy, width: w, height: H, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - Math.min(1, p)) * 90}px) scale(${lerp(0.9, 1, Math.min(1, p))}) rotate(${tilt}deg)`, borderRadius: radius, background: kind === 'phone' ? '#05080f' : '#0b1220', border: `${kind === 'phone' ? 3 : 2}px solid rgba(232,182,76,0.5)`, boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 90px rgba(232,182,76,0.16)', overflow: 'hidden'}}>
      {kind === 'browser' && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: bar, display: 'flex', alignItems: 'center', gap: bar * 0.22, padding: `0 ${bar * 0.5}px`, background: '#101a2c'}}>
          {['#ff6159', '#ffbd2e', '#28c941'].map((c) => <span key={c} style={{width: bar * 0.26, height: bar * 0.26, borderRadius: 99, background: c, opacity: 0.85}} />)}
          <div style={{marginLeft: bar * 0.3, flex: 1, height: bar * 0.62, borderRadius: 99, background: '#0a1322', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BODY, fontWeight: 500, fontSize: bar * 0.4, color: COLORS.muted}}>optcgduel.app</div>
        </div>
      )}
      <div style={{position: 'absolute', left: bez, top: bar + bez, width: innerW, height: innerH, overflow: 'hidden', borderRadius: kind === 'phone' ? radius - bez : 0, background: '#07101d'}}>
        <Parts parts={parts} w={innerW} h={innerH} cam={cam} />
      </div>
    </div>
  );
};

export const frameHeight = (clip: ClipId, w: number, kind: 'browser' | 'phone' = 'browser') => {
  const info = CLIPS[clip];
  const bar = kind === 'browser' ? Math.round(w * 0.06) : 0;
  const bez = kind === 'phone' ? Math.round(w * 0.035) : 0;
  return Math.round(((w - bez * 2) * info.h) / info.w) + bar + bez * 2;
};

/** Full-bleed product footage behind hook type: motion from the very first frame, dimmed so the words stay readable. */
export const Backdrop: React.FC<{parts: Part_[]; scrim?: number; cam?: Cam}> = ({parts, scrim = 0.5, cam}) => {
  const L = useHL();
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Parts parts={parts} w={L.W} h={L.H} cam={cam} />
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(8,16,36,${scrim}) 0%, rgba(8,16,36,${scrim + 0.12}) 55%, rgba(8,16,36,${scrim}) 100%)`}} />
    </div>
  );
};

/** Big kinetic type on a translucent panel, laid over footage that is still too small to read (start/end in frames of the scene). */
export const Callout: React.FC<{x: number; y: number; w: number; h: number; start: number; end?: number; children: React.ReactNode}> = ({x, y, w, h, start, end, children}) => {
  const f = useCurrentFrame();
  const p = pop(f, start, {damping: 15, stiffness: 150});
  const out = end === undefined ? 1 : 1 - prog(f, end, end + 5, Easing.in(Easing.quad));
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', padding: '0 40px', borderRadius: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'rgba(8,16,36,0.86)', border: '2px solid rgba(232,182,76,0.6)', boxShadow: '0 24px 70px rgba(0,0,0,0.5)', opacity: Math.min(1, p * 2) * out, transform: `translateY(${(1 - Math.min(1, p)) * 60}px)`}}>{children}</div>
  );
};

/* ---------- counter ---------- */

export const Counter: React.FC<{to: number; start: number; dur: number; size: number}> = ({to, start, dur, size}) => {
  const f = useCurrentFrame();
  const v = Math.round(to * prog(f, start, start + dur, Easing.out(Easing.cubic)));
  const p = pop(f, start - 4);
  return (
    <div style={{fontFamily: NUM, fontWeight: 700, fontSize: size, lineHeight: 1, color: COLORS.gold, letterSpacing: '0.02em', textShadow: '0 0 80px rgba(232,182,76,0.45), 0 8px 40px rgba(0,0,0,0.5)', opacity: Math.min(1, p * 2), transform: `scale(${lerp(0.8, 1, Math.min(1, p))})`, fontVariantNumeric: 'tabular-nums'}}>{v}</div>
  );
};

/* ---------- brand ---------- */

export const BrandMark: React.FC<{size: number}> = ({size}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{overflow: 'visible'}}>
    <defs><clipPath id="hype-crown"><path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" /></clipPath></defs>
    <rect x="8" y="6" width="16" height="23" rx="2.5" fill="#a8853f" stroke="#e2b458" strokeWidth="1.4" transform="rotate(-14 16 17)" />
    <g transform="rotate(12 23 21)">
      <rect x="15" y="9" width="16" height="23" rx="2.5" fill="#16303b" stroke="#e2b458" strokeWidth="2" />
      <g transform="translate(23 21.5) scale(0.27) translate(-32 -31)">
        <path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" fill="#e2b458" />
        <rect x="17" y="32" width="30" height="6" fill="#b8322a" clipPath="url(#hype-crown)" />
        <rect x="8" y="37" width="48" height="5" rx="2.5" fill="#d9a441" />
      </g>
    </g>
  </svg>
);

export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const L = useHL();
  const v = L.vertical;
  const logo = pop(f, 0, {damping: 13, stiffness: 100});
  const pill = pop(f, 14, {damping: 11, stiffness: 170});
  const sheen = prog(f, 26, 56);
  const logoSize = v ? 300 : 240;
  const col = (children: React.ReactNode, top: number) => <div style={{position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center', textAlign: 'center'}}>{children}</div>;
  const y0 = v ? 420 : 110;
  return (
    <>
      {col(
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: prog(f, 0, 6), transform: `scale(${lerp(0.55, 1, Math.min(1.05, logo))})`, filter: 'drop-shadow(0 0 50px rgba(232,182,76,0.4))'}}>
          <BrandMark size={logoSize} />
        </div>, y0,
      )}
      {col(
        <div style={{opacity: prog(f, 4, 12), transform: `translateY(${(1 - prog(f, 4, 14)) * 30}px)`, fontFamily: HEAD, fontWeight: 800, fontSize: v ? 112 : 96, letterSpacing: '-0.02em', color: COLORS.ink, textShadow: shadow}}>OPTCG <span style={{color: COLORS.gold}}>Duel</span></div>, y0 + logoSize + 20,
      )}
      {col(
        <div style={{position: 'relative', overflow: 'hidden', padding: v ? '26px 70px' : '22px 64px', borderRadius: 999, background: `linear-gradient(180deg, ${COLORS.goldBright}, ${COLORS.gold} 55%, ${COLORS.goldDeep})`, boxShadow: '0 20px 60px rgba(232,182,76,0.35), 0 0 0 1px rgba(255,255,255,0.3) inset', fontFamily: BODY, fontWeight: 700, fontSize: v ? 70 : 60, color: COLORS.navy0, opacity: Math.min(1, pill * 2), transform: `scale(${lerp(0.7, 1, Math.min(1.08, pill))})`}}>
          optcgduel.app
          <div style={{position: 'absolute', top: 0, bottom: 0, width: '30%', left: `${lerp(-40, 130, sheen)}%`, background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.7), transparent)'}} />
        </div>, y0 + logoSize + (v ? 200 : 170),
      )}
      {v && col(
        <div style={{opacity: prog(f, 22, 32), transform: `translateY(${(1 - prog(f, 22, 32)) * 14}px)`, fontFamily: BODY, fontWeight: 600, fontSize: 46, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLORS.goldBright, textShadow: shadow}}>Link in bio</div>, y0 + logoSize + 352,
      )}
      {col(
        <div style={{opacity: prog(f, 24, 34), fontFamily: BODY, fontWeight: 500, fontSize: v ? 50 : 44, color: COLORS.ink, textShadow: shadow}}>Free in your browser. No download.</div>, y0 + logoSize + (v ? 450 : 320),
      )}
      {col(
        <div style={{opacity: prog(f, 34, 46), fontFamily: BODY, fontWeight: 400, fontSize: v ? 36 : 30, color: COLORS.muted}}>Fan-made. Not affiliated with Bandai Namco.</div>, y0 + logoSize + (v ? 560 : 410),
      )}
    </>
  );
};

/** Gold sheen sweeping across on a cut. */
export const CutSweep: React.FC = () => {
  const f = useCurrentFrame();
  const L = useHL();
  const p = f / 14;
  if (p > 1) return null;
  const span = L.vertical ? L.H : L.W;
  const x = lerp(-0.3, 1.3, 1 - Math.pow(1 - p, 3)) * span;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: Math.sin(p * Math.PI) * 0.35}}>
      <div style={{position: 'absolute', ...(L.vertical ? {left: 0, right: 0, top: x - 130, height: 260, background: 'linear-gradient(180deg, transparent, rgba(232,182,76,0.3) 50%, transparent)', transform: 'skewY(-8deg)'} : {top: 0, bottom: 0, left: x - 130, width: 260, background: 'linear-gradient(90deg, transparent, rgba(232,182,76,0.3) 50%, transparent)', transform: 'skewX(-14deg)'})}} />
    </div>
  );
};

export const TextCard: React.FC<{children: React.ReactNode; x: number; y: number; w: number; h: number; start: number; tone?: 'muted' | 'gold'; from?: 'left' | 'right' | 'bottom'}> = ({children, x, y, w, h, start, tone = 'muted', from = 'bottom'}) => {
  const f = useCurrentFrame();
  const p = pop(f, start, {damping: 15, stiffness: 140});
  const d = (1 - Math.min(1, p)) * 160;
  const [dx, dy] = from === 'left' ? [-d, 0] : from === 'right' ? [d, 0] : [0, d];
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', borderRadius: 36, padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center', opacity: Math.min(1, p * 2), transform: `translate(${dx}px, ${dy}px)`, background: tone === 'gold' ? 'linear-gradient(160deg, rgba(20,48,92,0.96), rgba(11,22,48,0.96))' : 'rgba(14,27,48,0.82)', border: tone === 'gold' ? `3px solid ${COLORS.gold}` : '2px solid rgba(159,177,194,0.3)', boxShadow: tone === 'gold' ? '0 30px 90px rgba(0,0,0,0.5), 0 0 70px rgba(232,182,76,0.22)' : '0 20px 60px rgba(0,0,0,0.4)'}}>{children}</div>
  );
};

/** Small persistent brand bug: the two-card mark + "OPTCG Duel", semi-opaque, inside the safe area. */
export const BrandBug: React.FC<{out?: number}> = ({out}) => {
  const f = useCurrentFrame();
  const L = useHL();
  const a = prog(f, 0, 10) * 0.82 * (out === undefined ? 1 : 1 - prog(f, out, out + 6, Easing.linear));
  const size = L.vertical ? 64 : 52;
  return (
    <div style={{position: 'absolute', top: L.vertical ? L.top + 8 : 34, ...(L.vertical ? {left: 48} : {right: 56}), display: 'flex', alignItems: 'center', gap: 10, padding: '6px 22px 6px 12px', borderRadius: 999, background: 'rgba(8,16,36,0.55)', border: '1px solid rgba(232,182,76,0.35)', opacity: a, fontFamily: HEAD, fontWeight: 800, fontSize: L.vertical ? 34 : 28, color: COLORS.ink, letterSpacing: '-0.01em'}}>
      <BrandMark size={size} />
      <span>OPTCG <span style={{color: COLORS.gold}}>Duel</span></span>
    </div>
  );
};
