import React from 'react';
import {Logo} from '../../Logo';
import {COLORS} from '../../theme';
import {At, display, ease, lerp, prog, sans, sp, useL, useScene} from '../anim';

const TITLE = 'OPTCG Duel';

export const LogoScene: React.FC = () => {
  const f = useScene();
  const L = useL();
  const {logo: g, width: W} = L;
  const draw = prog(f, 2, 32, (t) => t); // stroke then hat
  const logoIn = sp(f, 2, {damping: 14, stiffness: 90});
  const lineP = prog(f, 30, 56);
  const subP = prog(f, 50, 68);
  const chars = TITLE.split('');
  const dim = display(g.titleSize);
  return (
    <>
      <At x={W / 2} y={g.cy} w={g.size} h={g.size} style={{transform: `translate(0, ${lerp(60, 0, logoIn)}px) scale(${lerp(0.6, 1, logoIn)}) rotate(${lerp(-12, 0, logoIn)}deg)`, opacity: prog(f, 0, 8), left: W / 2 - g.size / 2}}>
        <div style={{filter: `drop-shadow(0 0 ${30 + 30 * (1 - draw)}px rgba(232,182,76,0.45))`}}>
          <Logo size={g.size} draw={draw} id="m-logo" />
        </div>
      </At>
      <div style={{position: 'absolute', left: 0, width: W, top: g.titleY - g.titleSize / 2, display: 'flex', justifyContent: 'center', whiteSpace: 'pre'}}>
        {chars.map((c, i) => {
          const p = sp(f, 8 + i * 2.2, {damping: 18, stiffness: 150});
          const gold = i < 5;
          return (
            <span key={i} style={{display: 'inline-block', overflow: 'hidden', fontSize: g.titleSize, lineHeight: 1, padding: '0.1em 0.012em 0.14em', margin: '-0.1em 0 -0.14em', whiteSpace: 'pre'}}>
              <span style={{...dim, display: 'inline-block', color: gold ? COLORS.gold : COLORS.ink, transform: `translateY(${lerp(115, 0, Math.min(1, p))}%)`}}>{c}</span>
            </span>
          );
        })}
      </div>
      {/* gold line sweeps under the title */}
      <div style={{position: 'absolute', left: W / 2 - g.lineW / 2, top: g.titleY + g.titleSize * 0.62, width: g.lineW, height: 5}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${COLORS.gold} 30%, ${COLORS.goldBright} 50%, ${COLORS.gold} 70%, transparent)`, clipPath: `inset(0 ${(1 - lineP) * 100}% 0 0)`, boxShadow: '0 0 24px rgba(232,182,76,0.6)'}} />
      </div>
      <div style={{position: 'absolute', left: 0, width: W, top: g.subY, textAlign: 'center', ...sans(g.subSize, {color: COLORS.muted, letterSpacing: '0.04em'}), opacity: subP, transform: `translateY(${lerp(18, 0, ease(subP))}px)`}}>
        The One Piece Card Game, <span style={{color: COLORS.gold}}>online.</span>
      </div>
    </>
  );
};
