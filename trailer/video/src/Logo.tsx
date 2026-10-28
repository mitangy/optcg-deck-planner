import React from 'react';
import {COLORS} from './theme';

/** App mark (duel-web/public/favicon.svg) without the rounded-square backing, so it floats on the gradient. */
export const Logo: React.FC<{size: number; draw?: number; id?: string}> = ({size, draw = 1, id = 'logo'}) => {
  // draw: 0..1 progress of the card outline stroke; the hat fills in with the last 40%.
  const perimeter = 2 * (36 + 54);
  const hatOpacity = Math.max(0, Math.min(1, (draw - 0.55) / 0.45));
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{overflow: 'visible'}}>
      <defs>
        <clipPath id={`${id}-crown`}>
          <path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" />
        </clipPath>
      </defs>
      <rect x="14" y="5" width="36" height="54" rx="5" fill="#16303b" fillOpacity={0.9 * Math.min(1, draw * 1.5)} />
      <rect
        x="14" y="5" width="36" height="54" rx="5" fill="none" stroke={COLORS.gold} strokeWidth="3.5"
        strokeDasharray={perimeter} strokeDashoffset={perimeter * (1 - draw)} strokeLinecap="round"
      />
      <g transform="translate(32 32) scale(0.66) translate(-32 -31)" opacity={hatOpacity}>
        <path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" fill="#e2b458" />
        <rect x="17" y="32" width="30" height="6" fill="#b8322a" clipPath={`url(#${id}-crown)`} />
        <rect x="8" y="37" width="48" height="5" rx="2.5" fill="#d9a441" />
      </g>
    </svg>
  );
};
