import React from 'react';
import {COLORS} from '../../theme';
import {At, display, lerp, M, prog, sans, sp, useL, useScene} from '../anim';

const CREWS = [
  {name: 'Straw Hats', c: '#c8372d'},
  {name: 'Wano', c: '#2f9e5f'},
  {name: 'Heart Pirates', c: '#f2c230', dark: true},
  {name: 'Marines', c: '#2b6cb0'},
  {name: 'Donquixote', c: '#e75a9b'},
];
const STEP = 15;
const MAT_AT = 5 * STEP;

export const ThemesScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const t = L.themes;
  const h = (t.panelW / t.aspect);
  const diag = Math.hypot(t.panelW, h) / 2 + 20;
  const inP = sp(f, 0, {damping: 18, stiffness: 80});
  const idx = Math.min(CREWS.length - 1, Math.max(0, Math.floor(f / STEP)));
  const matP = prog(f, MAT_AT, MAT_AT + 18, (x) => 1 - Math.pow(1 - x, 3));
  const chipText = f >= MAT_AT ? 'Your own playmat' : CREWS[idx].name;
  const chipC = f >= MAT_AT ? COLORS.gold : CREWS[idx].c;
  const chipDark = f >= MAT_AT || CREWS[idx].dark;
  const chipPop = sp(f, f >= MAT_AT ? MAT_AT + 8 : idx * STEP + 3, {damping: 10, stiffness: 220});
  return (
    <>
      <At x={L.width / 2} y={t.titleY} style={{left: 0, width: L.width, textAlign: 'center', transform: `translateY(-50%) translateY(${lerp(40, 0, prog(f, 0, 14))}px)`, opacity: prog(f, 0, 10)}}>
        <span style={display(t.titleSize)}>Make it <span style={{color: COLORS.gold}}>yours.</span></span>
      </At>
      <div style={{position: 'absolute', left: t.cx - t.panelW / 2, top: t.cy - h / 2 + lerp(120, 0, inP), width: t.panelW, height: h, opacity: prog(f, 0, 8), transform: `scale(${lerp(0.92, 1, inP)})`}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: 26, overflow: 'hidden', border: '1.5px solid rgba(232,182,76,0.45)', boxShadow: '0 50px 110px rgba(0,0,0,0.6), 0 0 80px rgba(47,143,166,0.25)', background: COLORS.navy1}}>
          <img src={M('03-themes.png')} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
          {CREWS.map((c, i) => {
            const p = prog(f, i * STEP, i * STEP + 16, (x) => 1 - Math.pow(1 - x, 3));
            if (p <= 0) return null;
            const R = p * diag * 2;
            return (
              <React.Fragment key={c.name}>
                <div style={{position: 'absolute', inset: 0, background: c.c, mixBlendMode: 'color', opacity: 0.85, clipPath: `circle(${R / 2}px at 50% 50%)`}} />
                <div style={{position: 'absolute', inset: 0, background: c.c, mixBlendMode: 'overlay', opacity: 0.5, clipPath: `circle(${R / 2}px at 50% 50%)`}} />
                {p < 1 && <div style={{position: 'absolute', left: '50%', top: '50%', width: R, height: R, marginLeft: -R / 2, marginTop: -R / 2, borderRadius: '50%', border: `5px solid ${c.c}`, boxShadow: `0 0 40px ${c.c}`, opacity: 1 - p * 0.5}} />}
              </React.Fragment>
            );
          })}
          {matP > 0 && (
            <div style={{position: 'absolute', inset: 0, clipPath: `circle(${matP * diag}px at 50% 50%)`}}>
              <img src={M('04-custom-art.png')} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: `scale(${t.matZoom})`, transformOrigin: '48% 50%'}} />
            </div>
          )}
          {matP > 0 && matP < 1 && <div style={{position: 'absolute', left: '50%', top: '50%', width: matP * diag * 2, height: matP * diag * 2, marginLeft: -matP * diag, marginTop: -matP * diag, borderRadius: '50%', border: `5px solid ${COLORS.gold}`, boxShadow: `0 0 40px ${COLORS.gold}`}} />}
        </div>
        <div style={{position: 'absolute', left: '50%', bottom: -t.chipSize * 1.1, transform: `translateX(-50%) scale(${lerp(0.8, 1, Math.min(1, chipPop))})`, padding: `${t.chipSize * 0.3}px ${t.chipSize * 0.9}px`, borderRadius: 999, background: chipC, color: chipDark ? COLORS.navy0 : '#fff', boxShadow: `0 16px 40px rgba(0,0,0,0.5), 0 0 40px ${chipC}88`, whiteSpace: 'nowrap', ...sans(t.chipSize, {fontWeight: 700, color: chipDark ? COLORS.navy0 : '#fff', letterSpacing: '0.02em'})}}>
          {chipText}
        </div>
      </div>
    </>
  );
};
