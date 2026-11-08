import React from 'react';
import {COLORS} from '../../theme';
import {lerp, M, prog, sans, sp, useL, useScene} from '../anim';

const PANELS = [
  {img: '06-friends.png', label: 'Play friends', at: 0},
  {img: '08-ranked.png', label: 'Climb the ranks', at: 30},
  {img: '07-spectate.png', label: 'Spectate live', at: 60},
  {img: '09-logpose.png', label: 'AI match review', at: 90},
];

export const FeaturesScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const g = L.features;
  const h = (g.panelW / g.aspect);
  const drift = f / 150;
  return (
    <div style={{position: 'absolute', inset: 0, perspective: g.perspective, perspectiveOrigin: '50% 50%'}}>
      <div style={{position: 'absolute', left: g.cx, top: g.cy, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateY(${g.ry + drift * 5}deg) rotateX(${g.rx - drift * 2}deg) translate3d(${-drift * 60}px, ${-drift * 20}px, ${drift * 60}px)`}}>
        {PANELS.map((p, i) => {
          const s = sp(f, p.at, {damping: 18, stiffness: 80, mass: 1.1});
          const x = (i - 1.5) * g.dx;
          const y = (i - 1.5) * g.dy;
          const o = prog(f, p.at, p.at + 8);
          const next = PANELS[i + 1]?.at;
          // 1 while this is the newest panel on the stack, 0 once the next one lands
          const act = prog(f, p.at + 4, p.at + 16) * (next === undefined ? 1 : 1 - prog(f, next + 2, next + 14));
          const grow = 1 + 0.06 * act;
          const line = prog(f, p.at + 14, p.at + 34);
          const chip = prog(f, p.at + 28, p.at + 38);
          const vx = L.vertical ? 0 : 520;
          const vy = L.vertical ? 360 : 140;
          const lw = g.labelSize * p.label.length * 0.58 + 70;
          const lx = 70, ly = -g.labelSize * 1.7;
          const path = `M 40 0 L 40 ${ly + 30} Q 40 ${ly} ${lx} ${ly} L ${lx + 44 + lw * 0.0} ${ly}`;
          return (
            <div
              key={p.img}
              style={{
                position: 'absolute', left: -g.panelW / 2, top: -h / 2, width: g.panelW, height: h, opacity: o, transformStyle: 'preserve-3d', transformOrigin: '35% 0%',
                transform: `translate3d(${x + lerp(vx, 0, s)}px, ${y + lerp(vy, 0, s)}px, ${i * 90 + lerp(-500, 0, s) + act * 60}px) scale(${grow})`,
              }}
            >
              <div style={{position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden', border: `${lerp(1.5, 4, act)}px solid rgba(232,182,76,${lerp(0.35, 1, act)})`, boxShadow: `0 50px 100px rgba(0,0,0,0.6), 0 0 ${60 * act}px rgba(232,182,76,${0.45 * act}), 0 0 60px rgba(47,143,166,0.25)`, background: COLORS.navy1}}>
                <img src={M(p.img)} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: `brightness(${lerp(0.8, 1.2, act)}) contrast(1.05) blur(${lerp(1.6, 0, act)}px)`}} />
                <div style={{position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,255,255,${0.16 * (1 - s)}), transparent 40%)`}} />
              </div>
              <svg width={g.panelW} height={h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
                <path d={`M 40 2 L 40 ${ly + 30} Q 40 ${ly} ${lx} ${ly} L ${lx + 36} ${ly}`} pathLength={1} fill="none" stroke={COLORS.gold} strokeWidth={4} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - line} style={{filter: 'drop-shadow(0 0 8px rgba(232,182,76,0.7))'}} />
                <circle cx={40} cy={2} r={9 * prog(line, 0, 0.2)} fill={COLORS.gold} />
              </svg>
              <div style={{position: 'absolute', left: lx + 44, top: ly, transform: `translate(0,-50%) translateX(${lerp(-24, 0, chip)}px)`, opacity: chip, padding: `${g.labelSize * 0.22}px ${g.labelSize * 0.55}px`, borderRadius: 999, background: 'rgba(8,16,36,0.92)', border: `2px solid ${COLORS.gold}`, boxShadow: '0 12px 30px rgba(0,0,0,0.5)', whiteSpace: 'nowrap', ...sans(g.labelSize, {fontWeight: 700, color: COLORS.goldBright})}}>
                {p.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
