import React from 'react';
import {COLORS} from '../../theme';
import {At, display, lerp, prog, sans, sp, useL, useScene} from '../anim';

const Icon: React.FC<{kind: number; size: number; p: number}> = ({kind, size, p}) => {
  const st = {fill: 'none', stroke: COLORS.gold, strokeWidth: 3.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, strokeDasharray: '1 1', strokeDashoffset: 1 - p};
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{overflow: 'visible', filter: 'drop-shadow(0 0 8px rgba(232,182,76,0.5))'}}>
      {kind === 0 && (<><circle cx="32" cy="32" r="26" {...st} /><path d="M20 33l8 8 16-18" {...st} /></>)}
      {kind === 1 && (<><rect x="10" y="12" width="26" height="38" rx="4" transform="rotate(-10 23 31)" {...st} /><rect x="28" y="14" width="26" height="38" rx="4" transform="rotate(10 41 33)" {...st} /></>)}
      {kind === 2 && (<><path d="M32 6l6 17 17 6-17 6-6 17-6-17-17-6 17-6z" {...st} /><path d="M50 44l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" {...st} strokeWidth={2.5} /></>)}
    </svg>
  );
};

const TILES = [
  {big: ['Free'], sub: 'Play in your browser.', at: 15},
  {big: ['Ranked +', 'friends'], sub: 'Climb the ladder.', at: 30},
  {big: ['Log Pose', 'AI coach'], sub: 'Review every match.', at: 45},
];

export const StatsScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const s = L.stats;
  return (
    <>
      <At x={L.width / 2} y={s.titleY} style={{left: 0, width: L.width, textAlign: 'center', transform: `translateY(-50%) translateY(${lerp(40, 0, prog(f, 0, 14))}px)`, opacity: prog(f, 0, 10)}}>
        <span style={display(s.titleSize)}>Built for <span style={{color: COLORS.gold}}>players.</span></span>
      </At>
      {TILES.map((t, i) => {
        const r = s.tiles[i];
        const p = sp(f, t.at - 15, {damping: 16, stiffness: 110});
        const line = prog(f, t.at - 5, t.at + 20);
                const horiz = L.vertical;
        const iconS = horiz ? 120 : 110;
        return (
          <div key={t.big[0]} style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: prog(f, t.at - 15, t.at - 5), transform: `translateY(${lerp(120, 0, p)}px) scale(${lerp(0.9, 1, p)})`, borderRadius: 32, background: 'linear-gradient(160deg, rgba(20,40,72,0.92), rgba(9,20,42,0.92))', border: '1.5px solid rgba(232,182,76,0.4)', boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)', padding: horiz ? 36 : 44, boxSizing: 'border-box', display: 'flex', flexDirection: horiz ? 'row' : 'column', alignItems: horiz ? 'center' : 'flex-start', gap: horiz ? 36 : 0, justifyContent: horiz ? 'flex-start' : 'space-between', overflow: 'hidden'}}>
            <div style={{position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,182,76,0.18), transparent 65%)'}} />
            <Icon kind={i} size={iconS} p={line} />
            <div style={{minWidth: 0}}>
              <div style={{...display(s.bigSize), whiteSpace: 'nowrap'}}>
                {t.big.map((line, li) => (
                  <div key={li} style={{overflow: 'hidden', padding: '0.06em 0 0.12em', margin: '-0.06em 0 -0.12em'}}>
                    <div style={{color: i === 0 ? COLORS.gold : COLORS.ink, transform: `translateY(${lerp(110, 0, sp(f, t.at - 6 + li * 3, {damping: 18, stiffness: 150}))}%)`}}>{line}</div>
                  </div>
                ))}
              </div>
              <div style={{height: 4, width: 220, transform: `scaleX(${line})`, transformOrigin: 'left', background: COLORS.gold, borderRadius: 2, margin: '16px 0 14px', boxShadow: '0 0 16px rgba(232,182,76,0.7)'}} />
              <div style={{...sans(s.subSize, {color: COLORS.muted}), opacity: prog(f, t.at + 6, t.at + 18)}}>{t.sub}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};
