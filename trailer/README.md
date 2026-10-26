# Trailer

Build notes for the optcgduel.app trailer (issue #754). Capture scripts write `trailer/clips/<id>.mp4`; the Remotion project in `trailer/video/` edits them into `trailer/out/trailer-16x9.mp4`.

## Rendering

The edit lives in `trailer/video/` (Remotion 4, React, TypeScript). It reads the clips from `trailer/clips/` and renders a 1920x1080, 30 fps, 72 s trailer on a 120 BPM grid (every cut lands on a 0.5 s beat).

```bash
cd trailer/video
npm install
npm run clips:placeholders   # optional: labelled placeholder clips, ONLY for ids missing from ../clips
npm run render               # -> trailer/out/trailer-16x9.mp4  (about 6 min on 4 CPUs)
npm run render:9x16          # -> trailer/out/trailer-9x16.mp4  (stub layout, 1080x1920)
npm run studio               # live preview and scrubbing while tuning
```

`npm run render`, `studio` and `still` run `npm run prerender` first: it copies `../clips/*.mp4` into `public/clips/` (gitignored), probes each clip's real duration, and notes whether `public/music.mp3` exists. Real capture output is never overwritten by the placeholder script. Quick check of one frame: `npm run still -- out.png --frame=600`.

Where to tune, all in one file, `trailer/video/src/scenes.config.ts`:

- `CLIPS`: clip manifest (id, file, nominal duration, orientation).
- `SCENES`: the timeline. Per scene: `start` / `dur` (seconds, keep to multiples of 0.5), `trimStart`, `rate` (speed), `clipDelay`, `transition` (`cut`, `fade`, `zoom`, `wipe-right`, `wipe-left`), `eyebrow` (small caps sub-caption) and `focus`: camera keyframes `{at, rect}` where `rect` is `{x, y, w, h}` in 0..1 clip coordinates (`r(x, y, w)` is a 16:9 shortcut). The camera springs to each rect at its `at` time. Re-aim these once the real footage exists.
- `CAPTIONS`: the on-screen lines and when they show (`em` words get the gold bold style).
- `END_CARD`: end-card clips, URL and the "Not affiliated" line.

Other knobs: `src/layout.ts` (frame size and text positions for 16:9 and 9:16), `src/theme.ts` (colours, `BPM`, fonts), `src/Background.tsx` (gradient, compass, sea lines).

Music: drop a licensed 120 BPM track at `trailer/video/public/music.mp3` (gitignored). It fades in over 1.5 s and out over the last 3 s. Without the file the trailer renders silent. If a captured clip is shorter than its scene, its last frame is held; if longer, the scene's `trimStart` / `rate` decide what is used.

Fonts (Sora and Fraunces, the app's fonts) are vendored in `public/fonts/` so renders work offline. If Remotion cannot download its own headless Chrome, set `REMOTION_USE_PW_CHROME=1` to use the Playwright one in `/opt/pw-browsers`.
