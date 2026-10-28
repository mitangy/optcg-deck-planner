import React from 'react';
import {COLORS, FONT_SANS} from './theme';

export const BAR_H = 36;

const Dot: React.FC<{c: string}> = ({c}) => <div style={{width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.85}} />;

/** Rounded, softly shadowed browser window. Children fill the (w x h) content area. */
export const BrowserFrame: React.FC<{w: number; h: number; url?: string; children: React.ReactNode}> = ({w, h, url = 'optcgduel.app', children}) => (
  <div
    style={{
      width: w, height: h + BAR_H, borderRadius: 18, overflow: 'hidden', background: COLORS.barBg,
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 60px 120px -30px rgba(0,0,0,0.75), 0 24px 48px -12px rgba(0,0,0,0.5), 0 0 140px rgba(232,182,76,0.07)',
    }}
  >
    <div style={{height: BAR_H, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, position: 'relative', background: 'linear-gradient(#142340, #0e1b30)'}}>
      <Dot c="#ff6b61" />
      <Dot c="#ffc13b" />
      <Dot c="#3ddc84" />
      <div
        style={{
          position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', height: BAR_H - 12, minWidth: 260,
          borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, fontFamily: FONT_SANS, fontSize: 14, fontWeight: 400, color: COLORS.muted, letterSpacing: 0.2,
        }}
      >
        <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke={COLORS.muted} strokeWidth="1.4">
          <rect x="1" y="5.5" width="9" height="6.5" rx="1.5" />
          <path d="M3 5.5V3.8a2.5 2.5 0 0 1 5 0v1.7" />
        </svg>
        {url}
      </div>
    </div>
    <div style={{position: 'relative', width: w, height: h, overflow: 'hidden', background: '#000'}}>{children}</div>
  </div>
);

/** Phone bezel, content is (w x h). */
export const PhoneFrame: React.FC<{w: number; h: number; island?: number; children: React.ReactNode}> = ({w, h, island = 1, children}) => (
  <div
    style={{
      width: w + 20, height: h + 20, borderRadius: 52, padding: 10, boxSizing: 'border-box', background: '#070c18',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 60px 110px -25px rgba(0,0,0,0.8), 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 120px rgba(47,143,166,0.18)',
      position: 'relative',
    }}
  >
    <div style={{position: 'relative', width: w, height: h, borderRadius: 42, overflow: 'hidden', background: '#000'}}>{children}</div>
    <div style={{position: 'absolute', top: 20, left: '50%', width: 74, height: 20, borderRadius: 10, background: '#02050b', transform: 'translateX(-50%)', zIndex: 3, opacity: island}} />
  </div>
);
