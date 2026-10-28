import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Logo} from '../Logo';
import {COLORS, FONT_DISPLAY, FONT_SANS} from '../theme';
import {aspectOf, fitBest, fitCol, Key, NumberBadge, Rich, Shot, type InfographicSpec, type Step} from './kit';

type Orientation = 'portrait' | 'landscape';

export const SIZES = {portrait: {w: 1080, h: 1350}, landscape: {w: 1920, h: 1080}} as const;

const plain = (t: string) => t.replace(/\*\*/g, '');

/** Rough height of the step sentence at font size fs in a box of width w (Sora is about 0.56em per glyph). */
const textHeight = (t: string, w: number, fs: number, keys: boolean) => {
  const perLine = Math.max(8, Math.floor(w / (fs * 0.56)));
  const lines = Math.ceil((plain(t).length * 1.07) / perLine);
  return lines * fs * 1.3 + (keys ? fs * 1.75 : 0);
};

const Picture: React.FC<{step: Step; w: number; h: number; portrait: boolean; wide?: boolean}> = ({step, w, h, portrait, wide}) => {
  // Wide, short picture areas (portrait cards with the text on the left) get wider crops.
  const single = (step.shots?.length ?? 0) === 1;
  const shots = (step.shots ?? []).map((s) => {
    if (wide && single && s.ar) return {...s, ar: Math.min(2.6, s.ar * 1.4)};
    // Landscape columns are tall: board crops grow taller (more board around the control) instead of floating in space.
    if (!portrait && s.ar && !s.inside) return {...s, ar: Math.min(s.ar, 1.2)};
    return s;
  });
  if (shots.length) {
    const gap = 34;
    const aspects = shots.map(aspectOf);
    // Landscape columns are tall and narrow: stack. Portrait picks whichever layout gives the pictures more room.
    const {dir, sizes} = !portrait && shots.length > 1 ? {dir: 'col' as const, sizes: fitCol(aspects, w, h - 10, gap)} : fitBest(aspects, w, h - 10, gap);
    return (
      <div style={{width: w, height: h, display: 'flex', flexDirection: dir === 'row' ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap}}>
        {shots.map((s, i) => (
          <Shot key={i} spec={s} w={sizes[i].w} h={sizes[i].h} />
        ))}
      </div>
    );
  }
  const keySize = Math.max(34, Math.min(86, h * 0.34, w / 5));
  return (
    <div style={{width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: keySize * 0.5, flexWrap: 'wrap', alignContent: 'center'}}>
      {step.bigKeys?.map((k) => (
        <Key key={k} size={keySize}>
          {k}
        </Key>
      ))}
      {step.chip ? (
        <div
          style={{
            fontFamily: FONT_SANS, fontWeight: 600, fontSize: Math.min(40, (w - 80) / (step.chip.length * 0.6)), color: COLORS.goldBright, padding: '20px 28px', borderRadius: 18,
            border: `2px dashed ${COLORS.gold}`, background: 'rgba(232,182,76,0.08)', letterSpacing: 0.3, whiteSpace: 'nowrap',
          }}
        >
          {step.chip}
        </div>
      ) : null}
    </div>
  );
};

/** Portrait, up to three steps: the sentence on the left, the pictures on the right. */
const RowCard: React.FC<{step: Step; n: number; w: number; h: number; fs: number}> = ({step, n, w, h, fs}) => {
  const pad = 20;
  const badge = Math.round(fs * 1.6);
  const textW = Math.round(Math.min(310, w * 0.32));
  return (
    <div
      style={{
        width: w, height: h, boxSizing: 'border-box', padding: pad, borderRadius: 26, display: 'flex', flexDirection: 'row', gap: 26,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))', border: '1px solid rgba(232,182,76,0.24)', boxShadow: '0 24px 50px -24px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{width: textW, flex: 'none', display: 'flex', gap: 16, alignItems: 'flex-start'}}>
        <NumberBadge n={n} size={badge} />
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontFamily: FONT_SANS, fontWeight: 600, fontSize: fs, lineHeight: 1.3, color: COLORS.ink, paddingTop: 2}}>
            <Rich text={step.text} />
          </div>
          <KeyRow keys={step.keys} fs={fs} />
        </div>
      </div>
      <div style={{flex: 1}}>
        <Picture step={step} w={w - pad * 2 - textW - 26} h={h - pad * 2} portrait wide />
      </div>
    </div>
  );
};

const KeyRow: React.FC<{keys?: string[]; fs: number}> = ({keys, fs}) =>
  keys?.length ? (
    <div style={{display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap'}}>
      {keys.map((k) => (
        <Key key={k} size={fs * 0.78}>
          {k}
        </Key>
      ))}
    </div>
  ) : null;

/** Text on top, pictures below: the 2x2 portrait grid and every landscape column. */
const StackCard: React.FC<{step: Step; n: number; w: number; h: number; fs: number; portrait: boolean}> = ({step, n, w, h, fs, portrait}) => {
  const pad = 22;
  const badge = Math.round(fs * 1.6);
  const textW = w - pad * 2;
  const th = Math.max(badge, textHeight(step.text, textW - badge - 16, fs, Boolean(step.keys?.length))) + 6;
  const picH = h - pad * 2 - th - 14;
  return (
    <div
      style={{
        width: w, height: h, boxSizing: 'border-box', padding: pad, borderRadius: 26, display: 'flex', flexDirection: 'column', gap: 14,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))', border: '1px solid rgba(232,182,76,0.24)', boxShadow: '0 24px 50px -24px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{display: 'flex', gap: 16, alignItems: 'flex-start', height: th}}>
        <NumberBadge n={n} size={badge} />
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontFamily: FONT_SANS, fontWeight: 600, fontSize: fs, lineHeight: 1.3, color: COLORS.ink, paddingTop: 2}}>
            <Rich text={step.text} />
          </div>
          <KeyRow keys={step.keys} fs={fs} />
        </div>
      </div>
      <Picture step={step} w={w - pad * 2} h={picH} portrait={portrait} />
    </div>
  );
};

export const Infographic: React.FC<{spec: InfographicSpec; orientation: Orientation}> = ({spec, orientation}) => {
  const {w: W, h: H} = SIZES[orientation];
  const portrait = orientation === 'portrait';
  const pad = portrait ? 56 : 64;
  const titleFs = Math.min(portrait ? 78 : 88, ((W - pad * 2) / (spec.title.length * 0.54)) | 0);
  const bodyTop = portrait ? 244 : 236;
  const footH = 40;
  const tipH = spec.tip ? (portrait ? 78 : 64) : 0;
  const bodyBottom = H - 34 - footH - 18 - (tipH ? tipH + 18 : 0);
  const bodyH = bodyBottom - bodyTop;
  const bodyW = W - pad * 2;
  const n = spec.steps.length;
  const gap = portrait ? 22 : 28;

  let cards: React.ReactNode;
  if (portrait && n === 4) {
    const cw = (bodyW - gap) / 2;
    const ch = (bodyH - gap) / 2;
    cards = (
      <div style={{display: 'flex', flexWrap: 'wrap', gap, width: bodyW}}>
        {spec.steps.map((s, i) => (
          <StackCard key={i} step={s} n={i + 1} w={cw} h={ch} fs={27} portrait />
        ))}
      </div>
    );
  } else if (portrait) {
    const ch = (bodyH - gap * (n - 1)) / n;
    cards = (
      <div style={{display: 'flex', flexDirection: 'column', gap, width: bodyW}}>
        {spec.steps.map((s, i) => (
          <RowCard key={i} step={s} n={i + 1} w={bodyW} h={ch} fs={n === 3 ? 31 : 33} />
        ))}
      </div>
    );
  } else {
    const cw = (bodyW - gap * (n - 1)) / n;
    cards = (
      <div style={{display: 'flex', gap, width: bodyW}}>
        {spec.steps.map((s, i) => (
          <StackCard key={i} step={s} n={i + 1} w={cw} h={bodyH} fs={n >= 4 ? 25 : 29} portrait={false} />
        ))}
      </div>
    );
  }

  return (
    <AbsoluteFill style={{background: COLORS.navy1, fontFamily: FONT_SANS, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `linear-gradient(155deg, ${COLORS.navy0} 0%, ${COLORS.navy1} 40%, #0c3350 70%, #0f5a6b 100%)`}} />
      <div style={{position: 'absolute', width: W * 0.9, height: W * 0.9, left: -W * 0.3, top: -W * 0.4, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,182,76,0.16), rgba(232,182,76,0) 62%)'}} />
      <div style={{position: 'absolute', width: W * 1.0, height: W * 1.0, right: -W * 0.35, bottom: -W * 0.55, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,143,166,0.34), rgba(47,143,166,0) 62%)'}} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 0.55}}>
        <g transform={`translate(${portrait ? W * 0.92 : W * 0.9} ${portrait ? 150 : 130})`} fill="none" stroke={COLORS.gold}>
          <circle r={portrait ? 190 : 230} strokeOpacity={0.12} strokeWidth={2} />
          <circle r={portrait ? 160 : 195} strokeOpacity={0.09} strokeWidth={1.5} strokeDasharray="4 14" />
          <circle r={portrait ? 110 : 135} stroke={COLORS.tealBright} strokeOpacity={0.14} strokeWidth={1.5} />
        </g>
      </svg>

      {/* header */}
      <div style={{position: 'absolute', left: pad, top: portrait ? 50 : 42, display: 'flex', alignItems: 'center', gap: 14}}>
        <Logo size={38} id={`logo-${spec.id}`} />
        <div style={{fontWeight: 700, fontSize: 20, letterSpacing: 4, color: COLORS.gold, textTransform: 'uppercase'}}>OPTCG Duel · How to</div>
      </div>
      <div style={{position: 'absolute', left: pad, top: portrait ? 98 : 84, width: bodyW, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: titleFs, lineHeight: 1.1, color: COLORS.ink, letterSpacing: -0.5, whiteSpace: 'nowrap'}}>
        {spec.title}
      </div>
      <div style={{position: 'absolute', left: pad, top: portrait ? 98 + titleFs * 1.18 : 84 + titleFs * 1.18, width: bodyW, fontWeight: 400, fontSize: portrait ? 28 : 30, color: COLORS.muted, whiteSpace: 'nowrap'}}>
        {spec.subtitle}
      </div>

      <div style={{position: 'absolute', left: pad, top: bodyTop}}>{cards}</div>

      {spec.tip ? (
        <div
          style={{
            position: 'absolute', left: pad, top: bodyBottom + 18, width: bodyW, height: tipH, boxSizing: 'border-box', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 18,
            padding: '0 26px', background: 'rgba(232,182,76,0.12)', border: '1px solid rgba(232,182,76,0.4)',
          }}
        >
          <div style={{fontWeight: 700, fontSize: 20, letterSpacing: 3, color: COLORS.navy0, background: COLORS.gold, borderRadius: 8, padding: '5px 12px'}}>TIP</div>
          <div style={{fontSize: portrait ? 25 : 26, color: COLORS.ink, lineHeight: 1.25}}>
            <Rich text={spec.tip} />
          </div>
        </div>
      ) : null}

      {/* footer */}
      <div style={{position: 'absolute', left: pad, right: pad, bottom: 34, height: footH, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontWeight: 700, fontSize: 26, color: COLORS.gold, letterSpacing: 0.5}}>optcgduel.app</div>
        <div style={{fontSize: 18, color: COLORS.muted}}>Unofficial fan project. Not affiliated with Bandai.</div>
      </div>
    </AbsoluteFill>
  );
};
