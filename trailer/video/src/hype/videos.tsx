import React from 'react';
import {Backdrop, Callout, Caption, Chip, Counter, EndCard, Eyebrow, Frame, Line, Stack, TextCard, frameHeight, useHL, type Part, type Part_} from './kit';
import type {Cue, HypeDef, Scene} from './HypeVideo';
import {BODY, CLIPS, COLORS, L_16x9, L_9x16, NUM, sec, type ClipId, type HypeLayout} from './theme';

const gold = (t: string): Part => ({t, gold: true});

/* ---------- scene builders ---------- */

/** Kinetic type, one or more lines, centred in the safe band. Each line is {parts, at (s)}; the first is visible from the start. */
const Type: React.FC<{lines: {parts: Part[]; at?: number; size?: number; weight?: number; font?: string; out?: number}[]; eyebrow?: number; big?: number; behind?: Part_[]}> = ({lines, eyebrow, big, behind}) => {
  const L = useHL();
  const size = big ?? (L.vertical ? 132 : 120);
  return (
    <>
      {behind && <Backdrop parts={behind} />}
      {eyebrow !== undefined && <Eyebrow until={sec(eyebrow)} />}
      <Stack gap={36}>
        {lines.map((l, i) => (
          <Delayed key={i} at={l.at ?? 0}><Line parts={l.parts} size={l.size ?? size} weight={l.weight} font={l.font} maxW={L.vertical ? 960 : 1500} out={l.out !== undefined ? sec(l.out) : undefined} /></Delayed>
        ))}
      </Stack>
    </>
  );
};

/** Mounts children `at` seconds into the scene, with their own local clock. */
const Delayed: React.FC<{at: number; children: React.ReactNode}> = ({at, children}) => {
  if (at <= 0) return <>{children}</>;
  return <SeqLocal from={sec(at)}>{children}</SeqLocal>;
};
import {Sequence} from 'remotion';
const SeqLocal: React.FC<{from: number; children: React.ReactNode}> = ({from, children}) => (
  <Sequence from={from} layout="none">{children}</Sequence>
);

/** 9:16 only: the 4:3 board captures leave the board small in a tall frame, so zoom the board clips in until it fills the frame
 *  (already-tight zooms stay as authored). */
const BOARD_CLIPS: ClipId[] = ['board', 'bot', 'theming', 'artBoard'];
const BOARD_BOOST = 1.4;
const boostBoard = (p: Part_): Part_ => (BOARD_CLIPS.includes(p.clip) && (p.zoom ?? 1) < 1.5 ? {...p, zoom: (p.zoom ?? 1) * BOARD_BOOST, zoomTo: p.zoomTo !== undefined ? p.zoomTo * BOARD_BOOST : undefined} : p);

/** Footage in a frame + a caption: under the frame (9:16) or beside it (16:9). */
const FootageScene: React.FC<{parts: Part_[]; caption?: Part[]; captionDelay?: number; kind?: 'browser' | 'phone'; frameW?: number; frameH?: number; frameY?: number; children?: React.ReactNode; eyebrow?: number; captionSize?: number; wideH?: number}> = ({
  parts, caption, captionDelay, kind = 'browser', frameW, frameH, frameY, children, eyebrow, captionSize, wideH,
}) => {
  const L = useHL();
  const clip: ClipId = parts[0].clip;
  if (L.vertical) {
    const info = CLIPS[clip];
    parts = parts.map(boostBoard);
    // Browser frames are 960 x 1020 (y 310..1330) with the capture cropped to the action; phones keep their own aspect.
    const maxH = 1020;
    const fit = Math.floor(maxH / (info.h / info.w + 0.07));
    const fh = frameH ?? (kind === 'browser' ? 1020 : undefined);
    const w = fh ? (frameW ?? 960) : Math.min(frameW ?? 960, fit);
    const h = fh ?? frameHeight(clip, w, kind);
    const top = frameY ?? 310 + Math.max(0, (1020 - h) / 2);
    return (
      <>
        <Frame parts={parts} w={w} h={fh} kind={kind} y={top} />
        {caption && <Stack y={1340} h={200} gap={0}><Caption text={caption} delay={captionDelay} size={captionSize} /></Stack>}
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
      <Frame parts={parts} w={w} h={fhW} kind={kind} x={90} y={(L.H - h) / 2} />
      {caption && (
        <div style={{position: 'absolute', left: 1330, width: 520, top: 0, bottom: 0, display: 'flex', alignItems: 'center'}}><Caption text={caption} delay={captionDelay} size={captionSize} /></div>
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
const scene = (at: number, dur: number, node: React.ReactNode, sweep?: boolean): Scene => ({at, dur, node, sweep});
const pops = (ts: number[], id = 'pop', gain = 0.34): Cue[] => ts.map((t) => ({t, id, gain}));
const endCue = (t: number): Cue[] => [{t: t - 0.5, id: 'riser', gain: 0.4}, {t, id: 'win', gain: 0.6}, {t: t + 0.5, id: 'shimmer', gain: 0.3}];

/* Capture times (s) in hype-bot.mp4, see trailer/capture/clips/21-hype-bot.ts marks.json. */
const BOT = {setupHard: 3.5, attack: 15.5, lethal: 32.6, over: 37.9};

/** The first second of every cut is product in motion behind the hook: a card landing, then the attack arrow. */
const hookBoard: Part_[] = [{clip: 'board', from: 1.4, dur: 1.4, fy: 0.5}, {clip: 'board', from: 6.7, dur: 1.6, fy: 0.5}];

/* ---------- 1. hype-passion ---------- */

const passion = (L: HypeLayout, id: string): HypeDef => {
  const v = L.vertical;
  const rz = v ? 3.2 : 3.7; // tight crop on the move-grade list
  return {
    id, layout: L, dur: 24,
    scenes: [
      scene(0, 3, <Type eyebrow={2.8} behind={hookBoard} lines={[{parts: ['We play this game.'], out: 1.4}, {parts: [gold('So we built the sim we wanted.')], at: 1.5}]} />),
      scene(3, 3, (
        <Stack gap={v ? 18 : 10}>
          <Counter to={476} start={4} dur={sec(1.6)} size={v ? 400 : 360} />
          <Line parts={['updates in 8 weeks']} size={v ? 96 : 70} delay={sec(0.6)} />
          <Line parts={['Every one is in What’s new.']} size={v ? 58 : 46} weight={500} font={BODY} delay={sec(1.4)} color={COLORS.muted} />
        </Stack>
      )),
      scene(6, 4, <FootageScene parts={[{clip: 'board', from: 1.3, dur: 2.4, fy: 0.42}, {clip: 'board', from: 6.6, dur: 1.6, zoom: 1.1, fy: 0.45}]} caption={['Real rules.', '\n', gold('Every effect.')]} />),
      scene(10, 3, <FootageScene wideH={860} parts={[{clip: 'review', from: 9.0, dur: 1.5, zoom: rz, fx: 1, fy: v ? 0.36 : 0.37}, {clip: 'review', from: 14.6, dur: 1.5, zoom: v ? 2.6 : 3.4, fx: 0.85, fy: v ? 0.8 : 0.78}]} caption={['A coach that reviews', '\n', gold('every turn.')]} />),
      scene(13, 3, <FootageScene parts={[{clip: 'bot', from: BOT.lethal + 0.9, dur: 1.6, rate: 1.5, fy: 0.5}, {clip: 'bot', from: BOT.over, dur: 1.4, fx: 0.5, fy: 0.5}]} caption={['Bots that', '\n', gold('play to win.')]} />),
      scene(16, 3, <FootageScene parts={[{clip: 'theming', from: 2.6, dur: 0.5}, {clip: 'theming', from: 5.9, dur: 0.5}, {clip: 'art', from: 2.3, dur: 0.7, zoom: 1.4, fx: 0.5, fy: 0.4}, {clip: 'artBoard', from: 0.8, dur: 0.6}, {clip: 'art', from: 14.9, dur: 0.7, zoom: 1.05, fx: 0.5, fy: 0.4}]} caption={['Make it', gold('yours.')]} captionSize={v ? 128 : undefined} />),
      scene(19, 2, <Chips items={[{text: 'Ranked seasons', at: 0.1}, {text: 'Friends + spectate', at: 0.6}, {text: 'Tournaments', at: 1.1}]} row />),
      scene(21, 3, <End />),
    ],
    cues: [...pops([4.4, 4.6, 4.8, 5.0, 5.2], 'pop', 0.22), {t: 3.0, id: 'accent', gain: 0.5}, {t: 1.5, id: 'accent-2', gain: 0.45}, ...pops([19.1, 19.6, 20.1], 'pop-hi', 0.36), ...pops([16.5, 17.5, 18.0], 'whoosh-short-hi', 0.2), {t: 6.0 + 2.6, id: 'impact', gain: 0.5}, ...endCue(21.3)],
  };
};

/* ---------- 2. hype-logpose ---------- */

const logpose = (): HypeDef => {
  const cap: Part[] = ['Ours tells you', '\n', gold('why you lost.')];
  const big = (t: Part[]) => <Line parts={t} size={84} maxW={840} stagger={3} />;
  return {
    id: 'hype-logpose', layout: L_9x16, dur: 15,
    scenes: [
      scene(0, 3, <Type eyebrow={2.8} behind={hookBoard} lines={[{parts: ['Lost again?'], out: 1.4}, {parts: ['Other sims show you the ', gold('board.')], at: 1.5, size: 112}]} />),
      scene(3, 4, <FootageScene parts={[{clip: 'review', from: 9.0, dur: 2.0, zoom: 3.2, fx: 1, fy: 0.36}, {clip: 'review', from: 14.6, dur: 2.0, zoom: 2.4, fx: 0.85, fy: 0.82}]} caption={cap} />),
      scene(7, 4, (
        <FootageScene parts={[{clip: 'logpose', from: 5.6, dur: 2.0, zoom: 1.35, fx: 0.5, fy: 0.48}, {clip: 'logpose', from: 5.6, dur: 2.0, zoom: 1.35, fx: 0.5, fy: 0.6}]} frameH={620} frameY={310} caption={cap} captionDelay={-99}>
          <Callout x={90} y={950} w={900} h={370} start={sec(0.1)} end={sec(1.95)}>{big([gold('Turn 7 was the swing turn.')])}</Callout>
          <Callout x={90} y={950} w={900} h={370} start={sec(2.05)}>{big(['One more counter held back would have kept it.'])}</Callout>
        </FootageScene>
      ), false),
      scene(11, 1.5, <Chips y={300} size={66} items={[{text: 'Reviews every turn', at: 0.0}, {text: 'Builds and edits decks', at: 0.3}, {text: 'Imports your OPTCGSim games', at: 0.6}]} />),
      scene(12.5, 2.5, <End />),
    ],
    cues: [{t: 1.5, id: 'accent', gain: 0.5}, {t: 3.0, id: 'impact', gain: 0.4}, {t: 7.1, id: 'pop-hi', gain: 0.4}, {t: 9.1, id: 'pop-hi', gain: 0.4}, ...pops([11.05, 11.35, 11.65], 'pop-hi', 0.36), ...endCue(12.8)],
  };
};

/* ---------- 3. hype-bots ---------- */

const bots = (): HypeDef => {
  const botHook: Part_[] = [{clip: 'bot', from: BOT.attack, dur: 2.5, fy: 0.5}];
  const slot = (text: string, at: number, dur: number) => (
    <Sequence from={sec(at)} durationInFrames={sec(dur)} layout="none"><div style={{position: 'absolute', left: 0, right: 0, top: 1365, display: 'flex', justifyContent: 'center'}}><Chip text={text} start={0} size={58} /></div></Sequence>
  );
  return {
    id: 'hype-bots', layout: L_9x16, dur: 15,
    scenes: [
      scene(0, 2.5, (
        <>
          <Backdrop parts={botHook} />
          <Stack gap={44}>
            <Line parts={['Bots', 'that', 'let', {t: 'you', strike: 26}, {t: 'win?', strike: 28}]} size={130} out={sec(1.45)} />
            <Delayed at={1.5}><Line parts={[gold('Not here.')]} size={190} /></Delayed>
            <Eyebrow until={sec(2.4)} />
          </Stack>
        </>
      )),
      scene(2.5, 7.5, (
        <>
          <FootageScene parts={[{clip: 'bot', from: BOT.attack, dur: 2.0, fy: 0.5}, {clip: 'bot', from: BOT.lethal, dur: 3.4, rate: 1.4, fy: 0.5}, {clip: 'bot', from: BOT.over, dur: 2.1, fx: 0.5, fy: 0.5}]} frameH={1020} />
          {slot('Tries every target', 0.2, 1.8)}
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
          <Frame parts={[{clip: 'bot', from: BOT.setupHard, dur: 2.5, zoom: 2.7, fx: 0.5, fy: 0.46}]} w={960} h={700} y={810} enter={sec(0.3)} />
        </>
      )),
      scene(12.5, 2.5, <End />),
    ],
    cues: [{t: 1.5, id: 'accent-3', gain: 0.6}, {t: 0.95, id: 'tuck', gain: 0.4}, ...pops([2.7, 4.5, 6.3, 8.2], 'pop-hi', 0.4), {t: 10.0, id: 'accent', gain: 0.5}, ...endCue(12.8)],
  };
};

/* ---------- 4. hype-custom ---------- */

const custom = (): HypeDef => {
  type P = [ClipId, number, Partial<Part_>?];
  const z = {zoom: 1.5, fx: 0.5, fy: 0.42}; // the playmat editor (wide)
  const bk = {zoom: 1.05, fx: 0.5, fy: 0.4}; // the card-back editor (tall)
  // Luffy leader + his life stack wearing the Straw Hat back, one tight shot.
  const lead = {zoom: 1.6, fx: 0.24, fy: 0.71};
  const cuts: number[] = [];
  const sec_ = (at: number, dur: number, ps: P[], caption: Part[], eyebrow?: boolean, each = 0.5) => {
    ps.forEach((_, i) => cuts.push(at + i * each));
    return scene(at, dur, <FootageScene parts={ps.map(([clip, from, o]) => ({clip, from, dur: each, ...o}))} caption={caption} captionSize={caption.length <= 2 ? 128 : 96} eyebrow={eyebrow ? 2.8 : undefined} />, true);
  };
  // Capture times (hype-art marks): playmat editors with Miko's mat (1.6 s), then two other players' mats (5.3 / 9.2 s, art shows ~1 s later); themed backs' editors open at 14.2 / 18.2 / 22.3 / 26.3 s (art shows ~0.6 s later).
  return {
    id: 'hype-custom', layout: L_9x16, dur: 18,
    scenes: [
      sec_(0, 3, [['art', 2.3, z], ['art', 5.95, z], ['art', 10.3, z], ['artBoard', 0.7], ['artBoard', 1.6], ['artBoard', 2.6]], ['Your ', gold('mat.')], true),
      sec_(3, 3, [['art', 14.85, bk], ['art', 18.9, bk], ['art', 23.0, bk], ['art', 27.05, bk]], ['Your ', gold('sleeves.')], false, 0.75),
      sec_(6, 3.5, [['artBoard', 1.5, lead], ['artBoard', 2.1, {...lead, zoomTo: 1.75}], ['art', 15.5, bk], ['artBoard', 3.9, lead], ['artBoard', 4.5, {...lead, fxTo: 0.26}], ['artBoard', 5.1, lead], ['artBoard', 5.7, {...lead, zoomTo: 1.75}]], ['Your ', gold('leader.'), '\n', 'Your ', gold('back.')]),
      sec_(9.5, 3, [['theming', 21.8], ['theming', 25.1], ['theming', 26.9], ['theming', 22.4], ['theming', 27.6], ['theming', 23.0]], ['Your ', gold('board.')]),
      sec_(12.5, 3, [['theming', 18.5], ['theming', 12.5], ['theming', 15.4], ['theming', 2.6], ['theming', 5.9], ['theming', 16.0]], ['Your ', gold('way.')]),
      scene(15.5, 2.5, <End />),
    ],
    cues: [...cuts.map((t, i): Cue => ({t: t + 0.02, id: i % 2 ? 'pop-lo' : 'pop', gain: 0.2})), ...[0, 3, 6, 9.5, 12.5].map((t): Cue => ({t: t + 0.05, id: 'accent', gain: 0.35})), ...endCue(15.8)],
  };
};

/* ---------- 5. hype-nobeef ---------- */

const nobeef = (): HypeDef => ({
  id: 'hype-nobeef', layout: L_9x16, dur: 18,
  scenes: [
    scene(0, 3, <Type eyebrow={2.8} behind={hookBoard} lines={[{parts: ['No beef with the other sims.'], size: 120}, {parts: ['(okay, a little)'], at: 1.6, size: 64, weight: 600, font: BODY}]} />),
    scene(3, 4, (
      <>
        <TextCard x={50} y={300} w={485} h={420} start={0} from="left">
          <div style={{fontFamily: NUM, fontWeight: 700, fontSize: 36, letterSpacing: '0.12em', color: COLORS.muted}}>OPTCGSIM</div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 54, lineHeight: 1.1, color: COLORS.ink}}>Download it, keep it updated.</div>
        </TextCard>
        <TextCard x={545} y={300} w={485} h={420} start={sec(0.25)} tone="gold" from="right">
          <div style={{fontFamily: NUM, fontWeight: 700, fontSize: 36, letterSpacing: '0.12em', color: COLORS.gold}}>OPTCG DUEL</div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 54, lineHeight: 1.1, color: COLORS.ink}}>Open a link. Phone too.</div>
        </TextCard>
        <Frame parts={[{clip: 'phone', from: 0.7, dur: 4}]} w={340} kind="phone" y={745} enter={sec(0.5)} />
        <Eyebrow until={0} />
      </>
    ), true),
    scene(7, 4, (
      <>
        <TextCard x={60} y={340} w={960} h={300} start={0} from="left">
          <Line parts={[{t: 'OPlayTCG:', gold: true}, 'great ladder.']} size={92} maxW={860} stagger={3} />
        </TextCard>
        <TextCard x={60} y={680} w={960} h={560} start={sec(2)} tone="gold" from="bottom">
          <Line parts={[{t: 'OPTCG Duel:', gold: true}, 'same ladder energy,', '\n', 'plus a coach that reviews every turn.']} size={82} maxW={880} delay={sec(2.1)} stagger={3} />
        </TextCard>
      </>
    )),
    scene(11, 4, (
      <>
        <Stack y={300} h={420} gap={22}>
          <Line parts={['Coming from ', gold('OPTCGSim?')]} size={92} />
          <Delayed at={1.2}><Line parts={['Import your games.', '\n', 'Log Pose reviews them.']} size={66} weight={700} maxW={900} stagger={3} /></Delayed>
        </Stack>
        <Frame parts={[{clip: 'import', from: 0.3, dur: 4, zoom: 1.5, fx: 0.5, fy: 0.4}]} w={760} y={745} enter={sec(1.2)} />
      </>
    )),
    scene(15, 3, <End />),
  ],
  cues: [{t: 0.2, id: 'accent', gain: 0.4}, {t: 1.7, id: 'pop-hi', gain: 0.4}, {t: 3.1, id: 'pop-lo', gain: 0.4}, {t: 3.4, id: 'pop-hi', gain: 0.4}, {t: 7.1, id: 'pop', gain: 0.4}, {t: 9.1, id: 'accent-2', gain: 0.5}, {t: 12.3, id: 'pop-hi', gain: 0.4}, ...endCue(15.3)],
});

export const HYPE_VIDEOS: HypeDef[] = [passion(L_9x16, 'hype-passion'), passion(L_16x9, 'hype-passion-16x9'), logpose(), bots(), custom(), nobeef()];
