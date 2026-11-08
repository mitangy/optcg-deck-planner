import React from 'react';
import {COLORS} from '../../theme';
import {Card, At, display, lerp, prog, sp, useL, useScene} from '../anim';

export const HAND = ['002', '004', '013', '008', '001', '009', '006', '011'].map((n) => `cards/ST01-${n}.jpg`);
const WORDS = [
  {t: 'Draw.', at: 15},
  {t: 'Play.', at: 45},
  {t: 'Attack.', at: 75},
];

export const StormScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const s = L.storm;
  const n = HAND.length;
  return (
    <>
      {/* kinetic words */}
      {WORDS.map((w, i) => {
        const next = WORDS[i + 1]?.at;
        const p = sp(f, w.at, {damping: 11, stiffness: 260, mass: 0.7});
        if (f < w.at || (next !== undefined && f >= next)) return null;
        const out = 0;
        const scale = lerp(1.35, 1, p);
        const last = i === WORDS.length - 1;
        return (
          <At key={w.t} x={L.width / 2} y={s.wordY} style={{left: 0, width: L.width, textAlign: 'center', transform: `translateY(-50%) scale(${scale})`, opacity: 1}}>
            <span style={display(s.wordSize, {color: last ? COLORS.gold : COLORS.ink})}>{w.t}</span>
          </At>
        );
      })}
      {/* beat flash ring behind words */}
      {WORDS.map((w) => {
        const p = prog(f, w.at, w.at + 14);
        return p > 0 && p < 1 ? (
          <div key={w.at} style={{position: 'absolute', left: L.width / 2 - 300, top: s.wordY - 300, width: 600, height: 600, borderRadius: '50%', border: `3px solid ${COLORS.gold}`, opacity: (1 - p) * 0.5, transform: `scale(${lerp(0.6, 2.2, p)})`}} />
        ) : null;
      })}
      {/* hand */}
      <div style={{position: 'absolute', inset: 0, perspective: 1800}}>
        {HAND.map((src, i) => {
          const d = i - (n - 1) / 2;
          const start = 2 + i * 3;
          const tx = s.handCx + d * s.spread;
          const ty = s.handCy + d * d * s.drop;
          const rot = d * s.fan;
          const fromX = s.handCx + d * 380 + (i % 2 ? 300 : -300);
          const fromY = -s.cardH * 0.7;
          const trails = [0, 4, 8];
          return trails.map((tr) => {
            const p = sp(f, start + tr, {damping: 17, stiffness: 85, mass: 1});
            if (tr > 0 && (p > 0.985 || f < start)) return null;
            if (f < start) return null;
            const op = tr === 0 ? prog(f, start, start + 5) : 0.28 / (tr / 4);
            const scale = lerp(2.6, 1, p);
            return (
              <Card
                key={`${i}-${tr}`} src={src} h={s.cardH}
                style={{
                  left: lerp(fromX, tx, p) - (s.cardH * 63) / 88 / 2, top: lerp(fromY, ty, p) - s.cardH / 2,
                  transform: `rotate(${lerp(d * 40 + (i % 2 ? 50 : -50), rot, p)}deg) rotateY(${lerp(55, 0, p)}deg) scale(${scale})`,
                  opacity: op, filter: `blur(${(1 - p) * (tr ? 7 : 4)}px)`,
                  zIndex: i,
                }}
              />
            );
          });
        })}
      </div>
    </>
  );
};
