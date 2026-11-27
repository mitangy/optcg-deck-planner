import React, {useContext} from 'react';
import {Sequence} from 'remotion';
import {Backdrop, Callout, Caption, Chip, Counter, EndCard, Eyebrow, Frame, Line, SceneCtx, Stack, TextCard, frameHeight, useHL, type Cam, type Part, type Part_} from './kit';
import type {Cue, HypeDef, Scene} from './HypeVideo';
import {BODY, CLIPS, COLORS, L_16x9, L_9x16, NUM, sec, type ClipId, type HypeLayout} from './theme';

const gold = (t: string): Part => ({t, gold: true});

/* ---------- scene builders ---------- */

/** Kinetic type, one or more lines, centred in the safe band. Each line is {parts, at (s)}. The first line is fully built at frame 0 (autoplay and
 *  thumbnails see the whole hook). Lines that replace the previous one (it has `out`) share one grid cell so nothing re-centres; lines that add below
 *  reserve their space from the start (words at opacity 0), so line 1 never moves. */
const Type: React.FC<{lines: {parts: Part[]; at?: number; size?: number; weight?: number; font?: string; out?: number}[]; eyebrow?: number; big?: number; behind?: Part_[]}> = ({lines, eyebrow, big, behind}) => {
  const L = useHL();
  const size = big ?? (L.vertical ? 132 : 120);
  const replace = lines.some((l) => l.out !== undefined);
  const els = lines.map((l, i) => (
    <div key={i} style={replace ? {gridArea: '1 / 1', alignSelf: 'center', justifySelf: 'center'} : undefined}>
      <Line parts={l.parts} size={l.size ?? size} weight={l.weight} font={l.font} maxW={L.vertical ? 960 : 1500} out={l.out !== undefined ? sec(l.out) : undefined} delay={i === 0 && !l.at ? -14 : sec(l.at ?? 0)} stagger={i === 0 && !l.at ? 0 : 4} />
    </div>
  ));
  return (
    <>
      {behind && <Backdrop parts={behind} />}
      {eyebrow !== undefined && <Eyebrow until={sec(eyebrow)} />}
      <Stack gap={36}>{replace ? <div style={{display: 'grid'}}>{els}</div> : els}</Stack>
    </>
  );
};

/** 9:16 only: the 4:3 board captures leave the board small in a tall frame, so zoom the board clips in until it fills the frame
 *  (already-tight zooms stay as authored). */
const BOARD_CLIPS: ClipId[] = ['board', 'bot', 'theming', 'artBoard'];
const BOARD_BOOST = 1.4;
/** Uniform per scene: boost every board-clip part, unless one of them is already tight (>= 1.5), then none, so neighbouring parts keep their zoom ratio. */
const boostScene = (parts: Part_[], cam?: Cam): {parts: Part_[]; cam?: Cam} => {
  const board = parts.filter((p) => BOARD_CLIPS.includes(p.clip));
  if (board.length === 0 || board.some((p) => (p.zoom ?? 1) >= 1.5) || (cam && cam.zoom >= 1.5)) return {parts, cam};
  const b = (z?: number) => (z === undefined ? undefined : z * BOARD_BOOST);
  return {
    parts: parts.map((p) => (BOARD_CLIPS.includes(p.clip) ? {...p, zoom: (p.zoom ?? 1) * BOARD_BOOST, zoomTo: b(p.zoomTo)} : p)),
    cam: cam && BOARD_CLIPS.includes(parts[0].clip) ? {...cam, zoom: cam.zoom * BOARD_BOOST, zoomTo: b(cam.zoomTo)} : cam,
  };
};

/** Footage in a frame + a caption: under the frame (9:16) or beside it (16:9). `cont`: the previous scene already shows this frame, so it does not spring in again. */
const FootageScene: React.FC<{parts: Part_[]; cam?: Cam; cont?: boolean; caption?: Part[]; captionDelay?: number; kind?: 'browser' | 'phone'; frameW?: number; frameH?: number; frameY?: number; children?: React.ReactNode; eyebrow?: number; captionSize?: number; wideH?: number}> = ({
  parts, cam, cont, caption, captionDelay, kind = 'browser', frameW, frameH, frameY, children, eyebrow, captionSize, wideH,
}) => {
  const L = useHL();
  const dur = useContext(SceneCtx);
  const out = dur > 0 ? dur - 6 : undefined; // caption eases out over the last 5 frames, before the dissolve
  const enter = cont ? -60 : -3;
  const clip: ClipId = parts[0].clip;
  if (L.vertical) {
    const info = CLIPS[clip];
    const boosted = boostScene(parts, cam);
    parts = boosted.parts;
    cam = boosted.cam;
    // Browser frames are 960 x 940 (y 350..1290, inside the 250/400 safe band) with the capture cropped to the action; phones keep their own aspect.
    const maxH = 940;
    const fit = Math.floor(maxH / (info.h / info.w + 0.07));
    const fh = frameH ?? (kind === 'browser' ? 940 : undefined);
    const w = fh ? (frameW ?? 960) : Math.min(frameW ?? 960, fit);
    const h = fh ?? frameHeight(clip, w, kind);
    const top = frameY ?? 350 + Math.max(0, (940 - h) / 2);
    return (
      <>
        <Frame parts={parts} cam={cam} w={w} h={fh} kind={kind} y={top} enter={enter} />
        {caption && <Stack y={1300} h={210} gap={0}><Caption text={caption} delay={captionDelay} size={captionSize} out={out} /></Stack>}
        {children}
        {eyebrow !== undefined && <Eyebrow until={sec(eyebrow)} />}
      </>
    );
  }
  const info = CLIPS[clip];
  const fhW = wideH ?? frameH;
  const w = fhW ? (frameW ?? 1180) : Math.min(frameW ?? 1180, Math.floor(940 / (info.h / info.w + 0.06)));
  const h = fhW ?? frameHeight(clip, w, kind);
  return (
    <>
      <Frame parts={parts} cam={cam} w={w} h={fhW} kind={kind} x={90} y={(L.H - h) / 2} enter={enter} />
      {caption && (
        <div style={{position: 'absolute', left: 1310, width: 560, top: 0, bottom: 0, display: 'flex', alignItems: 'center'}}><Caption text={caption} delay={captionDelay} size={captionSize} out={out} /></div>
      )}
      {children}
      {eyebrow !== undefined && <Eyebrow until={sec(eyebrow)} />}
    </>
  );
};

const Chips: React.FC<{items: {text: string; at: number}[]; y?: number; size?: number; row?: boolean}> = ({items, y, size, row}) => {
  const L = useHL();
  const sz = size ?? (L.vertical ? 62 : 52);
  return (
    <Stack y={y ?? L.top} h={y ? L.bottom - y : undefined} gap={L.vertical ? 34 : 28}>
      <div style={{display: 'flex', flexDirection: row && !L.vertical ? 'row' : 'column', gap: L.vertical ? 34 : 36, alignItems: 'center'}}>
        {items.map((c) => <Chip key={c.text} text={c.text} start={sec(c.at)} size={sz} />)}
      </div>
    </Stack>
  );
};

const End: React.FC = () => <EndCard />;
const scene = (at: number, dur: number, node: React.ReactNode, sweep?: boolean, soft?: boolean): Scene => ({at, dur, node, sweep, soft});
const pops = (ts: number[], id = 'pop', gain = 0.34): Cue[] => ts.map((t) => ({t, id, gain}));
const endCue = (t: number): Cue[] => [{t: t - 0.5, id: 'riser', gain: 0.4}, {t, id: 'win', gain: 0.6}, {t: t + 0.5, id: 'shimmer', gain: 0.3}];

/* Capture times (s) in hype-bot.mp4, see trailer/capture/clips/21-hype-bot.ts marks.json. */
const BOT = {setupHard: 3.5, attack: 15.5, lethal: 32.6, over: 37.9};

/** The first seconds of every cut are product in motion behind the hook. One part: capture 3.0-6.0 s of hype-board.mp4, past the repeated frames at 2.6/2.7 s (x11grab dup_frames). */
const hookBoard: Part_[] = [{clip: 'board', from: 3.0, dur: 3.0, fy: 0.5}];

/* ---------- 1. hype-passion ---------- */

const passion = (L: HypeLayout, id: string): HypeDef => {
  const v = L.vertical;
  const wideH = 860; // one frame geometry for every footage scene, so `cont` scenes never re-enter
  const reviewCam: Cam = {zoom: v ? 2.8 : 3.5, fx: 1, fxTo: 0.85, fy: v ? 0.36 : 0.37, fyTo: v ? 0.8 : 0.78}; // tight crop on the move-grade list, panning down to the replay controls
  return {
    id, layout: L, dur: 23.5,
    scenes: [
      // Open on the sharpest proof; the counter is already at 476 on frame 0.
      scene(0, 3, (
        <>
          <Backdrop parts={hookBoard} />
          <Eyebrow until={sec(2.8)} />
          <Stack gap={v ? 18 : 10}>
            <Counter to={476} start={-26} dur={30} size={v ? 400 : 360} />
            <Line parts={['updates in 8 weeks']} size={v ? 96 : 70} delay={-14} stagger={0} />
            <Line parts={['Every one is in What’s new.']} size={v ? 58 : 46} weight={500} font={BODY} delay={sec(1.0)} color={COLORS.muted} />
          </Stack>
        </>
      )),
      scene(3, 3, <Type behind={[{clip: 'board', from: 6.0, dur: 3.0, fy: 0.5}]} lines={[{parts: ['We play this game.'], at: 0, out: 1.4}, {parts: v ? [gold('So we built the sim we wanted.')] : [gold('So we built the'), '\n', gold('sim we wanted.')], at: 1.5}]} />),
      scene(6, 4, <FootageScene wideH={wideH} parts={[{clip: 'board', from: 1.3, dur: 2.4, zoom: 1, fy: 0.44}, {clip: 'board', from: 6.6, dur: 1.6, zoom: 1, fy: 0.44}]} caption={['Real rules.', '\n', gold('Every effect.')]} />),
      scene(10, 3, <FootageScene cont wideH={wideH} cam={reviewCam} parts={[{clip: 'review', from: 9.0, dur: 1.5}, {clip: 'review', from: 14.6, dur: 1.5}]} caption={['A coach that reviews', '\n', gold('every turn.')]} />),
      scene(13, 3, <FootageScene cont wideH={wideH} parts={[{clip: 'bot', from: BOT.lethal + 0.9, dur: 1.6, rate: 1.5, fy: 0.5}, {clip: 'bot', from: BOT.over + 0.3, dur: 1.4, fx: 0.5, fy: 0.5}]} caption={['Bots that', '\n', gold('play to win.')]} />),
      scene(16, 3, <FootageScene cont wideH={wideH} parts={[{clip: 'theming', from: 2.6, dur: 1.0}, {clip: 'art', from: 2.55, dur: 1.0, zoom: 1.4, fx: 0.5, fy: 0.4}, {clip: 'artBoard', from: 0.8, dur: 1.0}]} caption={['Make it', gold('yours.')]} captionSize={v ? 128 : undefined} />),
      scene(19, 1.5, <Chips items={[{text: 'Ranked seasons', at: 0.0}, {text: 'Friends + spectate', at: 0.4}, {text: 'Tournaments', at: 0.8}]} row />, undefined, true),
      scene(20.5, 3, <End />, undefined, true),
    ],
    cues: [{t: 3.0, id: 'accent', gain: 0.5}, {t: 4.5, id: 'accent-2', gain: 0.45}, ...pops([19.1, 19.5, 19.9], 'pop-hi', 0.36), ...pops([16.5, 17.5], 'whoosh-short-hi', 0.2), {t: 6.0 + 2.6, id: 'impact', gain: 0.5}, ...endCue(20.8)],
  };
};

/* ---------- 2. hype-logpose ---------- */

const logpose = (): HypeDef => {
  const cap: Part[] = ['Ours tells you', '\n', gold('why you lost.')];
  const big = (t: Part[], extra: object = {}) => <Line parts={t} size={84} maxW={840} stagger={3} {...extra} />;
  return {
    id: 'hype-logpose', layout: L_9x16, dur: 15,
    scenes: [
      scene(0, 3, <Type eyebrow={2.8} behind={hookBoard} lines={[{parts: ['Lost again?'], out: 1.4}, {parts: ['Other sims show you the ', gold('board.')], at: 1.5, size: 112}]} />),
      scene(3, 4, <FootageScene frameH={800} frameY={350} cam={{zoom: 2.8, fx: 1, fxTo: 0.85, fy: 0.36, fyTo: 0.82}} parts={[{clip: 'review', from: 9.0, dur: 2.0}, {clip: 'review', from: 14.6, dur: 2.0}]} caption={cap} />),
      // The callout is the message here: no caption. One box, so only the words change.
      scene(7, 4, (
        <FootageScene cont frameH={800} frameY={350} parts={[{clip: 'logpose', from: 5.6, dur: 4.0, zoom: 1.35, fx: 0.5, fy: 0.48, fyTo: 0.6}]}>
          <Callout x={90} y={1170} w={900} h={320} start={sec(0.1)}>
            <div style={{display: 'grid'}}>
              <div style={{gridArea: '1 / 1', alignSelf: 'center', justifySelf: 'center'}}>{big([gold('Turn 7 was the swing turn.')], {out: sec(1.8)})}</div>
              <div style={{gridArea: '1 / 1', alignSelf: 'center', justifySelf: 'center'}}>{big(['One more counter held back would have kept it.'], {delay: sec(2.0)})}</div>
            </div>
          </Callout>
        </FootageScene>
      ), false),
      scene(11, 1.5, <Chips y={300} size={56} items={[{text: 'Reviews every turn', at: 0.0}, {text: 'Builds and edits decks', at: 0.3}, {text: 'Imports your OPTCGSim games', at: 0.6}]} />, undefined, true),
      scene(12.5, 2.5, <End />, undefined, true),
    ],
    cues: [{t: 1.5, id: 'accent', gain: 0.5}, {t: 3.0, id: 'impact', gain: 0.4}, {t: 7.1, id: 'pop-hi', gain: 0.4}, {t: 9.1, id: 'pop-hi', gain: 0.4}, ...pops([11.05, 11.35, 11.65], 'pop-hi', 0.36), ...endCue(12.8)],
  };
};

/* ---------- 3. hype-bots ---------- */

const bots = (): HypeDef => {
  const botHook: Part_[] = [{clip: 'bot', from: BOT.attack, dur: 2.5, fy: 0.5}];
  // Chips overlap by 3 frames: the old one eases out (5 frames) as the next springs in, so the band is never empty.
  const slot = (text: string, at: number, dur: number) => (
    <Sequence from={sec(at) - (at > 0.2 ? 3 : 0)} durationInFrames={sec(dur) + 3} layout="none"><div style={{position: 'absolute', left: 0, right: 0, top: 1365, display: 'flex', justifyContent: 'center'}}><Chip text={text} start={0} size={58} end={sec(dur) - 2} /></div></Sequence>
  );
  return {
    id: 'hype-bots', layout: L_9x16, dur: 15,
    scenes: [
      scene(0, 2.5, (
        <>
          <Backdrop parts={botHook} />
          <Eyebrow until={sec(2.4)} />
          <Stack gap={44}>
            <div style={{display: 'grid'}}>
              <div style={{gridArea: '1 / 1', alignSelf: 'center', justifySelf: 'center'}}><Line parts={['Bots', 'that', 'let', {t: 'you', strike: 26}, {t: 'win?', strike: 28}]} size={130} out={sec(1.45)} delay={-14} stagger={0} /></div>
              <div style={{gridArea: '1 / 1', alignSelf: 'center', justifySelf: 'center'}}><Line parts={[gold('Not here.')]} size={190} delay={sec(1.5)} /></div>
            </div>
          </Stack>
        </>
      )),
      scene(2.5, 7.5, (
        <>
          <FootageScene parts={[{clip: 'bot', from: BOT.attack, dur: 2.0, fy: 0.5}, {clip: 'bot', from: BOT.lethal, dur: 3.4, rate: 1.4, fy: 0.5}, {clip: 'bot', from: BOT.over + 0.3, dur: 2.1, fx: 0.5, fy: 0.5}]} frameH={940} />
          {slot('Tries every target', 0.0, 2.0)}
          {slot('Finds lethal', 2.0, 1.8)}
          {slot('Knows the top 10 meta Leaders', 3.8, 1.9)}
          {slot('Learns from Play vs Bot games', 5.7, 1.8)}
        </>
      ), true),
      scene(10, 2.5, (
        <>
          <Stack y={290} h={500} gap={24}>
            <Line parts={[gold('Pick Hard.')]} size={160} />
            <Line parts={['Bring your best deck.']} size={90} delay={sec(0.5)} stagger={3} />
          </Stack>
          {/* slowed so the 2.5 s covers only ~1.1 s of capture: the deck dropdown opens later and never hides "Hard" */}
          <Frame parts={[{clip: 'bot', from: BOT.setupHard, dur: 2.5, rate: 0.45, zoom: 2.7, fx: 0.5, fy: 0.46}]} w={960} h={700} y={810} enter={sec(0.3)} />
        </>
      )),
      scene(12.5, 2.5, <End />, undefined, true),
    ],
    cues: [{t: 1.5, id: 'accent-3', gain: 0.6}, {t: 0.95, id: 'tuck', gain: 0.4}, ...pops([2.7, 4.5, 6.3, 8.2], 'pop-hi', 0.4), {t: 10.0, id: 'accent', gain: 0.5}, ...endCue(12.8)],
  };
};

/* ---------- 4. hype-custom ---------- */

const custom = (): HypeDef => {
  const z = {zoom: 1.5, fx: 0.5, fy: 0.42}; // the playmat editor (wide)
  const bk = {zoom: 1.05, fx: 0.5, fy: 0.4}; // the card-back editor (tall)
  // Luffy leader + his life stack wearing the Straw Hat back, one slow push-in (a single part: no camera reset, no A-B-A insert).
  const lead = {zoom: 1.7, zoomTo: 1.85, fx: 0.24, fxTo: 0.27, fy: 0.72};
  const cuts: number[] = [];
  type P = [ClipId, number, number, Partial<Part_>?]; // clip, capture time, hold (s), overrides
  // Sections are placed back to back; every section after the first keeps the frame on screen (`cont`).
  let at = 0;
  const sec_ = (ps: P[], caption: Part[], opts: {eyebrow?: boolean; short?: boolean} = {}) => {
    const start = at;
    let t = start;
    ps.forEach(([, , d]) => { cuts.push(t); t += d; });
    const dur = t - start;
    at = t;
    return scene(start, dur, <FootageScene cont={start > 0} parts={ps.map(([clip, from, d, o]) => ({clip, from, dur: d, allowShort: opts.short, ...o}))} caption={caption} eyebrow={opts.eyebrow ? 2.8 : undefined} />, true);
  };
  // Capture times (hype-art marks): playmat editors with Miko's mat (1.6 s), then two other players' mats (5.3 / 9.2 s, art shows ~1 s later); themed backs' editors open at 14.2 / 18.2 / 22.3 / 26.3 s (art shows ~0.6 s later).
  // Parts are in capture order, so the board never ping-pongs; Miko's mat comes last, then the board shows that same mat dropping in.
  const scenes = [
    sec_([['art', 5.95, 0.8, z], ['art', 10.3, 0.8, z], ['art', 2.55, 0.8, z], ['artBoard', 0.7, 1.1, {zoom: 1, zoomTo: 1.15}]], ['Your ', gold('mat.')], {eyebrow: true, short: true}),
    sec_([['art', 14.85, 0.75, bk], ['art', 18.9, 0.75, bk], ['art', 23.0, 0.75, bk], ['art', 27.05, 0.75, bk]], ['Your ', gold('sleeves.')], {short: true}),
    sec_([['artBoard', 1.5, 3.5, lead]], ['Your ', gold('leader.'), '\n', 'Your ', gold('back.')]),
    sec_([['theming', 24.0, 1.5], ['theming', 26.0, 1.5]], ['Your ', gold('board.')]),
    sec_([['theming', 2.6, 1.0], ['theming', 5.9, 1.0], ['theming', 12.5, 1.0]], ['Your ', gold('way.')]),
  ];
  const endAt = at;
  const accents = scenes.map((s) => s.at);
  return {
    id: 'hype-custom', layout: L_9x16, dur: endAt + 2.5,
    scenes: [...scenes, scene(endAt, 2.5, <End />, undefined, true)],
    cues: [...cuts.map((t, i): Cue => ({t: t + 0.02, id: i % 2 ? 'pop-lo' : 'pop', gain: 0.2})), ...accents.map((t): Cue => ({t: t + 0.05, id: 'accent', gain: 0.35})), ...endCue(endAt + 0.3)],
  };
};

/* ---------- 5. hype-nobeef ---------- */

const nobeef = (): HypeDef => ({
  id: 'hype-nobeef', layout: L_9x16, dur: 18,
  scenes: [
    scene(0, 3, <Type eyebrow={2.8} behind={hookBoard} lines={[{parts: ['No beef with the other sims.'], size: 120}, {parts: ['(okay, a little)'], at: 1.6, size: 64, weight: 600, font: BODY}]} />),
    scene(3, 4, (
      <>
        <TextCard x={50} y={300} w={485} h={330} start={0} from="left">
          <div style={{fontFamily: NUM, fontWeight: 700, fontSize: 36, letterSpacing: '0.12em', color: COLORS.muted}}>OPTCGSIM</div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 54, lineHeight: 1.1, color: COLORS.ink}}>Download it, keep it updated.</div>
        </TextCard>
        <TextCard x={545} y={300} w={485} h={330} start={sec(0.25)} tone="gold" from="right">
          <div style={{fontFamily: NUM, fontWeight: 700, fontSize: 36, letterSpacing: '0.12em', color: COLORS.gold}}>OPTCG DUEL</div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 54, lineHeight: 1.1, color: COLORS.ink}}>Open a link. Phone too.</div>
        </TextCard>
        <Frame parts={[{clip: 'phone', from: 2.2, dur: 4, zoom: 1.5, fx: 0.5, fy: 0.3}]} w={520} h={820} kind="phone" y={670} enter={sec(0.2)} />
        <Eyebrow until={0} />
      </>
    ), true),
    scene(7, 4, (
      <>
        <TextCard x={60} y={340} w={960} h={300} start={0} from="left">
          <Line parts={[{t: 'OPlayTCG:', gold: true}, 'great ladder.']} size={92} maxW={860} stagger={3} />
        </TextCard>
        <TextCard x={60} y={680} w={960} h={560} start={sec(1.0)} tone="gold" from="bottom">
          <Line parts={[{t: 'OPTCG Duel:', gold: true}, 'same ladder energy', '+', 'a coach for every turn.']} size={82} maxW={880} delay={sec(1.1)} stagger={2} />
        </TextCard>
      </>
    )),
    scene(11, 4, (
      <>
        <Stack y={300} h={420} gap={22}>
          <Line parts={['Coming from ', gold('OPTCGSim?')]} size={92} />
          <Line parts={['Import your games.', '\n', 'Log Pose reviews them.']} size={66} weight={700} maxW={900} stagger={3} delay={sec(1.2)} />
        </Stack>
        <Frame parts={[{clip: 'import', from: 0.3, dur: 4, zoom: 2.2, fx: 0.3, fy: 0.42}]} w={760} h={760} y={745} enter={sec(0.5)} />
      </>
    )),
    scene(15, 3, <End />, undefined, true),
  ],
  cues: [{t: 0.2, id: 'accent', gain: 0.4}, {t: 1.7, id: 'pop-hi', gain: 0.4}, {t: 3.1, id: 'pop-lo', gain: 0.4}, {t: 3.4, id: 'pop-hi', gain: 0.4}, {t: 7.1, id: 'pop', gain: 0.4}, {t: 8.1, id: 'accent-2', gain: 0.5}, {t: 12.3, id: 'pop-hi', gain: 0.4}, ...endCue(15.3)],
});

export const HYPE_VIDEOS: HypeDef[] = [passion(L_9x16, 'hype-passion'), passion(L_16x9, 'hype-passion-16x9'), logpose(), bots(), custom(), nobeef()];
