import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FocusClip} from './FocusClip';
import {COLORS} from './theme';
import type {SceneDef} from './types';

/** Length of the transition into a scene, in frames: one full beat (0.5s), so cuts read as smooth crossfades, not jumps. */
export const OVERLAP = 15;

const SLANT = 14; // percent of width the wipe edge leans over the full height

/** One scene's footage plus its transition-in. Rendered inside a <Sequence> that starts on the beat. */
export const SceneLayer: React.FC<{scene: SceneDef; W: number; H: number}> = ({scene, W, H}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = interpolate(frame, [0, OVERLAP], [0, 1], {extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)});
  const t = scene.transition;

  const clip = (
    <FocusClip
      clip={scene.clip} W={W} H={H} focus={scene.focus} trimStart={scene.trimStart} rate={scene.rate}
      delay={scene.clipDelay} sceneFrames={Math.round(scene.dur * fps)}
    />
  );

  if (t === 'wipe-right' || t === 'wipe-left') {
    const x0 = -SLANT + p * (100 + 2 * SLANT);
    const mirror = t === 'wipe-left';
    const X = (v: number) => (mirror ? 100 - v : v);
    const poly = `polygon(${X(0)}% 0, ${X(x0 + SLANT)}% 0, ${X(x0 - SLANT)}% 100%, ${X(0)}% 100%)`;
    const angle = (Math.atan(((2 * SLANT) / 100) * W / H) * 180) / Math.PI * (mirror ? -1 : 1);
    const streakO = p < 1 ? Math.min(1, p * 8) * (1 - Math.max(0, (p - 0.8) / 0.2)) : 0;
    return (
      <div style={{position: 'absolute', inset: 0}}>
        <div style={{position: 'absolute', inset: 0, clipPath: p < 1 ? poly : undefined}}>{clip}</div>
        {p < 1 && (
          <div
            style={{
              position: 'absolute', left: `${X(x0)}%`, top: '50%', width: 6, height: H * 1.5, opacity: streakO,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              background: `linear-gradient(180deg, transparent, ${COLORS.goldBright}, transparent)`,
              boxShadow: `0 0 36px 10px rgba(232,182,76,0.55), 0 0 100px 30px rgba(232,182,76,0.22)`,
            }}
          />
        )}
      </div>
    );
  }

  if (t === 'zoom') {
    return (
      <div style={{position: 'absolute', inset: 0, opacity: p, transform: `scale(${1 + (1 - p) * 0.04})`, filter: p < 1 ? `blur(${(1 - p) * 3}px)` : undefined}}>
        {clip}
      </div>
    );
  }
  if (t === 'fade') return <div style={{position: 'absolute', inset: 0, opacity: p}}>{clip}</div>;
  return <div style={{position: 'absolute', inset: 0}}>{clip}</div>;
};
