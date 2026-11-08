import React from 'react';
import {Easing, random} from 'remotion';
import {COLORS} from '../../theme';
import {Card, At, CARD_AR, display, easeInOut, lerp, M, prog, sans, sp, useL, useScene} from '../anim';

const IMPACT = 92; // local frame the arrow lands (abs 302)

const Pill: React.FC<{vis: number; x: number; y: number; label: string; value: number; size: number; boost?: number; shake?: number}> = ({vis, x, y, label, value, size, boost = 0, shake = 0}) => (
  <At x={x} y={y} style={{opacity: vis, transform: `translate(-50%,-50%) translateX(${Math.sin(shake * 60) * 14 * (1 - shake)}px) scale(${1 + boost * 0.12})`}}>
    <div style={{display: 'flex', alignItems: 'baseline', gap: 14, padding: `${size * 0.25}px ${size * 0.6}px`, borderRadius: 999, background: 'rgba(11,22,48,0.86)', border: `2px solid ${boost > 0.05 ? COLORS.gold : 'rgba(232,182,76,0.4)'}`, boxShadow: boost > 0.05 ? '0 0 40px rgba(232,182,76,0.5)' : '0 10px 30px rgba(0,0,0,0.4)', whiteSpace: 'nowrap'}}>
      <span style={sans(size * 0.5, {color: COLORS.muted, letterSpacing: '0.14em', fontWeight: 600})}>{label}</span>
      <span style={display(size, {color: boost > 0.05 ? COLORS.goldBright : COLORS.ink, fontVariantNumeric: 'tabular-nums'})}>{value}</span>
    </div>
  </At>
);

export const AttackScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const a = L.attack;
  const w = a.cardH * CARD_AR;
  const inL = sp(f, 0, {damping: 15, stiffness: 90});
  const inR = sp(f, 5, {damping: 15, stiffness: 90});
  const donP = sp(f, 24, {damping: 13, stiffness: 130});
  const countP = prog(f, 36, 56);
  const power = 5000 + Math.round(countP * 10) * 100;
  const boost = prog(f, 36, 42) * (1 - prog(f, 56, 80));
  const arrow = prog(f, 62, IMPACT, easeInOut);
  const hit = f - IMPACT;
  const restP = sp(f, IMPACT + 4, {damping: 12, stiffness: 120});
  const shake = prog(f, IMPACT, IMPACT + 14, Easing.linear);
  // arrow geometry (start near attacker top-right, end at the target's top-left)
  const ax = a.leftX + w * 0.25, ay = a.cy - a.cardH * 0.5 + 20;
  const bx = a.rightX - w * 0.1, by = a.cy - a.cardH * 0.36;
  const lift = a.arcLift;
  const c1x = ax + (bx - ax) * 0.1, c1y = ay - lift, c2x = bx - (bx - ax) * 0.1, c2y = by - lift;
  const path = `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
  const ang = (Math.atan2(by - c2y, bx - c2x) * 180) / Math.PI;
  const yOff = (1 - inL) * 80;
  const impactP = prog(f, IMPACT, IMPACT + 18);
  return (
    <>

      {/* attacker + DON */}
      <At x={a.leftX} y={a.cy + yOff} style={{opacity: prog(f, 0, 8)}}>
        <Card src="cards/ST01-001.jpg" h={a.cardH} glow style={{left: -w / 2, top: -a.cardH / 2 - (1 - inL) * 0 + lerp(0, -18, prog(f, 62, 75)) * (1 - prog(f, 90, 100)), transform: `rotate(${lerp(-14, 0, inL)}deg)`}} />
        <div style={{position: 'absolute', left: -w / 2 + lerp(w * 0.9, w * 0.62, donP), top: -a.cardH / 2 + a.cardH * 0.28, opacity: prog(f, 24, 30), transform: `rotate(${lerp(40, 8, donP)}deg)`}}>
          <Card src="DON.jpg" h={a.cardH * 0.46} style={{position: 'relative', boxShadow: '0 0 0 3px #f6dc98, 0 20px 40px rgba(0,0,0,0.5)'}} />
        </div>
      </At>
      {/* target: rests (90deg) after impact */}
      <At x={a.rightX} y={a.cy + (1 - inR) * 80} style={{opacity: prog(f, 5, 13)}}>
        <Card src="cards/ST02-001.jpg" h={a.cardH} style={{left: -w / 2, top: -a.cardH / 2, transform: `translateX(${Math.sin(shake * 40) * 12 * (1 - shake) * (hit >= 0 ? 1 : 0)}px) rotate(${lerp(14, 0, inR) + 90 * restP}deg)`, filter: hit >= 0 ? `brightness(${1 + (1 - impactP) * 0.8})` : undefined}} />
      </At>
      <svg width={L.width} height={L.height} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <defs>
          <linearGradient id="arr" gradientUnits="userSpaceOnUse" x1={ax} y1={ay} x2={bx} y2={by}>
            <stop offset="0" stopColor={COLORS.goldDeep} />
            <stop offset="1" stopColor={COLORS.goldBright} />
          </linearGradient>
        </defs>
        {arrow > 0 && (
          <>
            <path d={path} pathLength={1} fill="none" stroke={COLORS.gold} strokeWidth={30} strokeOpacity={0.28} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - arrow} style={{filter: 'blur(14px)'}} />
            <path d={path} pathLength={1} fill="none" stroke="url(#arr)" strokeWidth={13} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - arrow} />
            <g transform={`translate(${bx} ${by}) rotate(${ang})`} opacity={prog(arrow, 0.9, 1)}>
              <path d="M 6 0 L -44 -30 L -30 0 L -44 30 Z" fill={COLORS.goldBright} />
            </g>
          </>
        )}
        {/* impact */}
        {hit >= 0 && impactP < 1 && (
          <g transform={`translate(${bx} ${by + 20})`}>
            <circle r={lerp(20, 260, impactP)} fill="none" stroke={COLORS.goldBright} strokeWidth={lerp(14, 1, impactP)} opacity={1 - impactP} />
            <circle r={lerp(10, 150, prog(f, IMPACT + 2, IMPACT + 16))} fill="none" stroke="#fff" strokeWidth={4} opacity={(1 - impactP) * 0.8} />
            {Array.from({length: 16}, (_, i) => {
              const th = (i / 16) * Math.PI * 2 + random(`p${i}`) * 0.4;
              const d = lerp(30, 120 + random(`d${i}`) * 220, impactP);
              return <circle key={i} cx={Math.cos(th) * d} cy={Math.sin(th) * d} r={lerp(9, 1, impactP) * (0.6 + random(`r${i}`))} fill={i % 3 ? COLORS.gold : '#fff'} opacity={1 - impactP} />;
            })}
          </g>
        )}
      </svg>
      <Pill vis={prog(f, 4, 14)} x={a.leftX} y={a.cy + a.cardH / 2 + a.badgeSize * 1.2} label="POWER" value={power} size={a.badgeSize} boost={boost} />
      <Pill vis={prog(f, 4, 14)} x={a.rightX} y={a.cy + a.cardH / 2 + a.badgeSize * 1.2} label="POWER" value={5000} size={a.badgeSize} shake={hit >= 0 ? shake : 1} />
      <At x={a.leftX + w * 0.9} y={a.cy - a.cardH * 0.52} style={{transform: `translate(-50%,-50%) scale(${sp(f, 26, {damping: 10})})`, opacity: prog(f, 26, 30) * (1 - prog(f, 56, 66))}}>
        <span style={display(a.badgeSize * 1.1, {color: COLORS.goldBright})}>DON!! +1000</span>
      </At>
      <div style={{position: 'absolute', left: 0, width: L.width, top: a.captionY - a.captionSize / 2, textAlign: 'center', opacity: prog(f, 20, 36), transform: `translateY(${lerp(20, 0, prog(f, 20, 36))}px)`, ...sans(a.captionSize, {color: COLORS.muted, letterSpacing: '0.03em'})}}>
        Real rules. <span style={{color: COLORS.gold}}>Every effect.</span>
      </div>
    </>
  );
};
