import React from 'react';
import {Logo} from '../../Logo';
import {COLORS} from '../../theme';
import {At, display, lerp, prog, sans, sp, useL, useScene} from '../anim';

export const EndScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const e = L.end;
  const logoP = sp(f, 0, {damping: 14, stiffness: 90});
  const head = sp(f, 15, {damping: 15, stiffness: 120});
  const pill = sp(f, 30, {damping: 11, stiffness: 160});
  const sheen = prog(f, 40, 70);
  const W = L.width;
  return (
    <>
      <At x={W / 2} y={e.logoY} w={e.logoSize} h={e.logoSize} style={{transform: `scale(${lerp(0.6, 1, logoP)})`, opacity: prog(f, 0, 8), left: W / 2 - e.logoSize / 2, top: e.logoY - e.logoSize / 2, filter: 'drop-shadow(0 0 40px rgba(232,182,76,0.4))'}}>
        <Logo size={e.logoSize} draw={1} id="m-end" />
      </At>
      <div style={{position: 'absolute', left: 0, width: W, top: e.headY - e.headSize / 2, textAlign: 'center', opacity: prog(f, 15, 24), transform: `translateY(${lerp(50, 0, head)}px)`}}>
        <span style={display(e.headSize)}>Play free in your <span style={{color: COLORS.gold}}>browser</span></span>
      </div>
      <div style={{position: 'absolute', left: 0, width: W, top: e.pillY - e.pillSize, display: 'flex', justifyContent: 'center', opacity: prog(f, 30, 38), transform: `scale(${lerp(0.7, 1, Math.min(1.1, pill))})`}}>
        <div style={{position: 'relative', overflow: 'hidden', padding: `${e.pillSize * 0.3}px ${e.pillSize * 1.1}px`, borderRadius: 999, background: `linear-gradient(180deg, ${COLORS.goldBright}, ${COLORS.gold} 55%, ${COLORS.goldDeep})`, boxShadow: '0 20px 60px rgba(232,182,76,0.35), 0 0 0 1px rgba(255,255,255,0.3) inset', ...sans(e.pillSize, {fontWeight: 700, color: COLORS.navy0, letterSpacing: '0.01em'})}}>
          optcgduel.app
          <div style={{position: 'absolute', top: 0, bottom: 0, width: '30%', left: `${lerp(-40, 130, sheen)}%`, background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.7), transparent)'}} />
        </div>
      </div>
      <div style={{position: 'absolute', left: W / 2 - e.discW / 2, width: e.discW, top: e.discY, textAlign: 'center', opacity: prog(f, 45, 60) * 0.75, ...sans(e.discSize, {color: COLORS.muted, lineHeight: 1.4})}}>
        Not affiliated with Bandai Namco. One Piece Card Game is a trademark of its respective owners.
      </div>
    </>
  );
};
