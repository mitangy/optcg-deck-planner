import React from 'react';
import {COLORS} from '../../theme';
import {At, display, easeInOut, lerp, M, prog, sans, sp, useL, useScene} from '../anim';

const WORDS = [
  {t: 'Desktop.', at: 0},
  {t: 'Phone.', at: 30},
  {t: 'Tablet.', at: 60},
  {t: 'No download.', at: 90},
];

export const AnywhereScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const a = L.anywhere;
  const sh = a.phoneH;
  const sw = (sh * 750) / 1624;
  const PAD = 16;
  const bw = sw + PAD * 2, bh = sh + PAD * 2;
  const R = 56;
  const perim = 2 * (bw + bh) - (8 - 2 * Math.PI) * R;
  const outline = prog(f, 24, 33, easeInOut);
  const fill = prog(f, 30, 35);
  const turn = sp(f, 60, {damping: 13, stiffness: 70, mass: 1.1});
  const cross = prog(f, 66, 84);
  const grow = sp(f, 62, {damping: 14, stiffness: 60});
  const desk = prog(f, 0, 8) * (1 - prog(f, 24, 30));
  const phoneIn = prog(f, 24, 28);
  const deskScale = lerp(1, 0.7, prog(f, 24, 34, easeInOut));
  return (
    <>
      {/* words */}
      {WORDS.map((w, i) => {
        const next = WORDS[i + 1]?.at;
        const p = sp(f, w.at, {damping: 12, stiffness: 200, mass: 0.7});
        if (f < w.at || (next !== undefined && f >= next)) return null;
        const out = 0;
        const last = i === WORDS.length - 1;
        return (
          <div key={w.t} style={{position: 'absolute', left: a.textCx - 480, width: 960, top: a.textY, textAlign: 'center', transform: `translateY(-50%) translateY(${lerp(60, 0, p)}px) scale(${lerp(1.15, 1, p)})`, opacity: i === 0 ? prog(f, 0, 8) : 1}}>
            <span style={display(a.textSize, {color: last ? COLORS.gold : COLORS.ink})}>{w.t}</span>
          </div>
        );
      })}
      {/* desktop panel first */}
      {desk > 0 && (
        <div style={{position: 'absolute', left: a.phoneCx - a.deskW / 2, top: a.phoneCy - (a.deskW * 9) / 32, width: a.deskW, height: (a.deskW * 9) / 16, opacity: desk, transform: `scale(${deskScale}) translateY(${lerp(80, 0, prog(f, 0, 14))}px)`, borderRadius: 22, overflow: 'hidden', border: `2px solid ${COLORS.gold}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 60px rgba(232,182,76,0.25)'}}>
          <img src={M('02-turn.png')} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.3) contrast(1.08) saturate(1.1)'}} />
        </div>
      )}
      {/* phone */}
      <div style={{position: 'absolute', left: a.phoneCx - bw / 2, top: a.phoneCy - bh / 2, width: bw, height: bh, opacity: phoneIn, transform: `rotate(${90 * turn}deg) scale(${lerp(1, a.landScale, grow)})`}}>
        <svg width={bw} height={bh} style={{position: 'absolute', inset: 0, overflow: 'visible', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.55))'}}>
          <rect x={0} y={0} width={bw} height={bh} rx={R} fill="#07101f" fillOpacity={fill} />
          <rect x={3} y={3} width={bw - 6} height={bh - 6} rx={R - 3} fill="none" stroke={COLORS.gold} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - outline} style={{filter: 'drop-shadow(0 0 10px rgba(232,182,76,0.6))'}} />
        </svg>
        <div style={{position: 'absolute', left: PAD, top: PAD, width: sw, height: sh, borderRadius: R - PAD, overflow: 'hidden', opacity: fill}}>
          <img src={M('phone-portrait.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 1 - cross}} />
          <img src={M('phone-landscape.png')} style={{position: 'absolute', left: (sw - sh) / 2, top: (sh - sw) / 2, width: sh, height: sw, objectFit: 'cover', transform: 'rotate(-90deg)', opacity: cross}} />
        </div>
        <div style={{position: 'absolute', left: bw / 2 - 40, top: 8, width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', opacity: fill * (1 - cross)}} />
      </div>
    </>
  );
};
