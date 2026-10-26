import React from 'react';
import {Freeze, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import generated from './generated.json';
import {CLIPS} from './scenes.config';
import type {ClipId, FocusKey, Rect} from './types';

type Cam = {z: number; cx: number; cy: number};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * Camera for a focus rect inside a (W x H) window showing a clip of aspect `clipAspect`
 * with "cover" fit. Zoom is limited so the view never leaves the footage.
 */
export const camFor = (rect: Rect, W: number, H: number, clipAspect: number): Cam => {
  const Hc = Math.max(H, W / clipAspect); // clip display size at z=1 (cover)
  const Wc = Hc * clipAspect;
  const z = Math.max(1, Math.min(W / (Wc * rect.w), H / (Hc * rect.h)));
  const vw = W / (Wc * z);
  const vh = H / (Hc * z);
  const cx = Math.min(1 - vw / 2, Math.max(vw / 2, rect.x + rect.w / 2));
  const cy = Math.min(1 - vh / 2, Math.max(vh / 2, rect.y + rect.h / 2));
  return {z, cx, cy};
};

const SPRING = {damping: 24, stiffness: 52, mass: 1};

const camAt = (frame: number, fps: number, keys: FocusKey[], cams: Cam[], i: number): Cam => {
  if (i === 0) return cams[0];
  const startF = keys[i].at * fps;
  if (frame < startF) return camAt(frame, fps, keys, cams, i - 1);
  const from = camAt(startF, fps, keys, cams, i - 1);
  const p = spring({frame: frame - startF, fps, config: SPRING});
  return {z: lerp(from.z, cams[i].z, p), cx: lerp(from.cx, cams[i].cx, p), cy: lerp(from.cy, cams[i].cy, p)};
};

type Props = {
  clip: ClipId;
  W: number;
  H: number;
  focus: FocusKey[];
  /** seconds into the clip where playback starts */
  trimStart?: number;
  rate?: number;
  /** seconds to hold the first frame before playing */
  delay?: number;
  /** total scene length in frames, for the slow push-in */
  sceneFrames: number;
};

/** Plays a clip (trimmed, speed-adjusted, last frame held) with spring zoom/pan driven by focus keyframes. */
export const FocusClip: React.FC<Props> = ({clip, W, H, focus, trimStart = 0, rate = 1, delay = 0, sceneFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const def = CLIPS[clip];
  const probed = (generated.clips as Record<string, {file: string; duration: number | null}>)[clip];
  const avail = probed?.duration ?? def.duration;
  const aspect = def.orientation === 'portrait' ? 750 / 1624 : 16 / 9;

  const delayF = Math.round(delay * fps);
  const playable = Math.max(1, Math.floor(((avail - trimStart) / rate) * fps));
  const vf = Math.min(Math.max(0, frame - delayF), playable - 1);

  const keys = focus.length ? focus : [{at: 0, rect: {x: 0, y: 0, w: 1, h: 1}}];
  const cams = keys.map((k) => camFor(k.rect, W, H, aspect));
  const cam = camAt(frame, fps, keys, cams, keys.length - 1);
  const drift = 1 + 0.02 * Math.min(1, frame / Math.max(1, sceneFrames));
  const z = cam.z * drift;

  const Hc = Math.max(H, W / aspect);
  const Wc = Hc * aspect;
  // translate so view-centre (cx,cy) sits at window centre; scale about the clip origin
  const tx = W / 2 - cam.cx * Wc * z;
  const ty = H / 2 - cam.cy * Hc * z;

  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: Wc, height: Hc, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})`}}>
        <Freeze frame={delayF + vf}>
          <Sequence from={delayF} layout="none">
            <OffthreadVideo
              src={staticFile(probed?.file ?? def.file)}
              startFrom={Math.round(trimStart * fps)}
              playbackRate={rate}
              muted
              style={{width: Wc, height: Hc, objectFit: 'cover', display: 'block'}}
            />
          </Sequence>
        </Freeze>
      </div>
    </div>
  );
};
