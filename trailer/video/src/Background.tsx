import React from 'react';
import {random, useCurrentFrame, useVideoConfig} from 'remotion';
import {BEAT, COLORS} from './theme';

const wavePath = (w: number, y: number, amp: number, len: number, phase: number) => {
  let d = `M 0 ${y}`;
  for (let x = 0; x <= w + 24; x += 24) {
    d += ` L ${x} ${(y + Math.sin((x / len) * Math.PI * 2 + phase) * amp + Math.sin((x / (len * 0.43)) * Math.PI * 2 - phase * 1.3) * amp * 0.35).toFixed(1)}`;
  }
  return d;
};

const TICKS = Array.from({length: 120}, (_, i) => i);
const MOTES = Array.from({length: 26}, (_, i) => i);

/** Deep navy -> teal gradient with a slow compass rose, drifting sea lines and gold motes. */
export const Background: React.FC<{cx: number; cy: number; compass: number}> = ({cx, cy, compass}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const beatPhase = (frame % BEAT) / BEAT;
  const pulse = Math.pow(1 - beatPhase, 3); // 1 on the beat, decays
  const t = frame / 30;

  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: COLORS.navy1}}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(155deg, ${COLORS.navy0} 0%, ${COLORS.navy1} 38%, #0c3350 62%, #0f5a6b 100%)`,
        }}
      />
      {/* drifting glows */}
      <div
        style={{
          position: 'absolute', width: W * 0.9, height: W * 0.9, borderRadius: '50%',
          left: -W * 0.25 + Math.sin(t * 0.25) * 60, top: -W * 0.3 + Math.cos(t * 0.2) * 40,
          background: 'radial-gradient(circle, rgba(232,182,76,0.13) 0%, rgba(232,182,76,0) 62%)',
        }}
      />
      <div
        style={{
          position: 'absolute', width: W * 1.0, height: W * 1.0, borderRadius: '50%',
          right: -W * 0.3 + Math.cos(t * 0.22) * 50, bottom: -W * 0.45 + Math.sin(t * 0.18) * 50,
          background: 'radial-gradient(circle, rgba(47,143,166,0.34) 0%, rgba(47,143,166,0) 62%)',
        }}
      />

      {/* compass rose */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <g transform={`translate(${cx} ${cy}) rotate(${frame * 0.045})`} opacity={0.5 + pulse * 0.12}>
          <circle r={compass} fill="none" stroke={COLORS.gold} strokeOpacity={0.12} strokeWidth={2} />
          <circle r={compass * 0.86} fill="none" stroke={COLORS.gold} strokeOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 14" />
          <circle r={compass * 0.62} fill="none" stroke={COLORS.tealBright} strokeOpacity={0.14} strokeWidth={1.5} />
          {TICKS.map((i) => {
            const a = (i / TICKS.length) * Math.PI * 2;
            const major = i % 10 === 0;
            const r1 = compass;
            const r2 = compass - (major ? 34 : 14);
            return (
              <line
                key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
                stroke={COLORS.gold} strokeOpacity={major ? 0.3 : 0.14} strokeWidth={major ? 2.5 : 1.5}
              />
            );
          })}
          {/* four-point star + diagonal needles */}
          {[0, 45, 90, 135].map((deg) => (
            <path
              key={deg}
              transform={`rotate(${deg})`}
              d={`M 0 ${-compass * (deg % 90 === 0 ? 0.98 : 0.72)} L ${compass * 0.035} 0 L 0 ${compass * (deg % 90 === 0 ? 0.98 : 0.72)} L ${-compass * 0.035} 0 Z`}
              fill={COLORS.gold} fillOpacity={deg % 90 === 0 ? 0.09 : 0.05}
            />
          ))}
        </g>
      </svg>

      {/* sea lines */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={wavePath(W, H * (0.9 + i * 0.035), 10 + i * 5, 380 + i * 140, t * (0.5 + i * 0.22) * (i % 2 ? -1 : 1) + i)}
            fill="none" stroke={i % 2 ? COLORS.tealBright : COLORS.gold}
            strokeOpacity={0.07 + i * 0.03} strokeWidth={1.6 + i * 0.4}
          />
        ))}
      </svg>

      {/* motes */}
      {MOTES.map((i) => {
        const x = random(`mx${i}`) * W;
        const speed = 8 + random(`ms${i}`) * 18;
        const y = (((random(`my${i}`) * H - t * speed) % H) + H) % H;
        const size = 2 + random(`mz${i}`) * 3;
        const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (0.6 + random(`mt${i}`)) + i));
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x + Math.sin(t * 0.4 + i) * 12, top: y, width: size, height: size,
              borderRadius: '50%', background: COLORS.goldBright, opacity: tw * 0.35,
            }}
          />
        );
      })}

      {/* vignette */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(3,7,18,0.55) 100%)',
        }}
      />
    </div>
  );
};
