import { useEffect, useRef } from "react";
import type { PlayerView } from "../net/protocol";
import type { BattleLogEntry } from "./battleLog";
import { motionCues, type MotionCue } from "./motionCues";
import { audioContext, playNotes, type Note } from "./turnAlert";

/** Game sound effects. The Life-loss, incoming-attack and opponent-tick cues live in turnAlert / soundCues. */
export type SfxId =
  | "draw"
  | "play"
  | "attack"
  | "block"
  | "counter"
  | "ko"
  | "don"
  | "trigger"
  | "win"
  | "lose"
  /** Your hand: a card dropped on a new spot, and Sort shuffling it. */
  | "tuck"
  | "riffle";

/** Loudest first: when one update earns many cues only the top few play. */
const PRIORITY: readonly SfxId[] = ["win", "lose", "ko", "trigger", "counter", "block", "attack", "play", "don", "draw", "riffle", "tuck"];
/** More than this at once is noise. */
const MAX_AT_ONCE = 3;

/** Unique cues, most important first, capped. */
export function mergeSfx(ids: readonly SfxId[]): SfxId[] {
  const set = new Set(ids);
  return PRIORITY.filter((id) => set.has(id)).slice(0, MAX_AT_ONCE);
}

/**
 * Log lines added since `prevId` (the newest line seen last time). undefined =
 * first look (mount: nothing is new); a vanished id = the log was replaced
 * (resync / undo), which is not new either; null = the log was empty before.
 */
export function newLogEntries(
  prevId: string | null | undefined,
  entries: readonly BattleLogEntry[],
): BattleLogEntry[] {
  if (prevId === undefined) return [];
  if (prevId === null) return [...entries];
  const at = entries.findIndex((e) => e.id === prevId);
  return at < 0 ? [] : entries.slice(at + 1);
}

const ATTACH_DON = /^(You|Opponent|Seat \d) attach(es)? DON!! to /;

/**
 * Cues earned by log lines. Opponent plays / counters / triggers already get
 * the soft tick from `useSoundCues`, and an attack on you has the incoming
 * cue, so players only hear their own for those. Spectators hear everything.
 */
export function logSfx(entries: readonly BattleLogEntry[], spectating: boolean): SfxId[] {
  const out: SfxId[] = [];
  for (const e of entries) {
    const mine = spectating || /^Your?\b/.test(e.text);
    if (e.tone === "ko") out.push("ko");
    else if (e.tone === "block") out.push("block");
    else if (e.tone === "attack" && mine) out.push("attack");
    else if (e.tone === "play" && mine) out.push("play");
    else if (e.tone === "counter" && mine) out.push("counter");
    else if (e.tone === "trigger" && mine) out.push("trigger");
    else if (e.tone === "routine" && ATTACH_DON.test(e.text)) out.push("don");
  }
  return out;
}

/** Cues earned by a view change: any draw, any DON!! added. */
export function viewSfx(cues: readonly MotionCue[]): SfxId[] {
  const out: SfxId[] = [];
  if (cues.some((c) => c.kind === "draw")) out.push("draw");
  if (cues.some((c) => c.kind === "don")) out.push("don");
  return out;
}

/** Win / lose the moment the match gets a winner; spectators have no side. */
export function resultSfx(
  prevWinner: number | null | undefined,
  winner: number | null,
  seat: number,
  spectating: boolean,
): SfxId | null {
  if (spectating || prevWinner === undefined || prevWinner !== null || winner == null) return null;
  return winner === seat ? "win" : "lose";
}

const GLINT = (freq: number, at: number, gain = 0.07): Note => ({ freq, at, len: 0.09, gain, type: "sine" });

const NOTES: Record<Exclude<SfxId, "draw" | "ko" | "tuck" | "riffle">, Note[]> = {
  play: [{ freq: 440, at: 0, len: 0.1, gain: 0.1, type: "triangle" }],
  attack: [{ freq: 300, at: 0, len: 0.15, gain: 0.07, type: "sawtooth", to: 620 }],
  block: [
    { freq: 220, at: 0, len: 0.08, gain: 0.07, type: "square" },
    { freq: 330, at: 0.02, len: 0.1, gain: 0.1, type: "triangle" },
  ],
  counter: [GLINT(784, 0, 0.1), GLINT(988, 0.07, 0.1)],
  don: [GLINT(1175, 0), GLINT(1568, 0.05)],
  trigger: [GLINT(660, 0, 0.1), GLINT(880, 0.07, 0.1), GLINT(1320, 0.14, 0.1)],
  win: [523, 659, 784, 1047].map((f, i) => ({ freq: f, at: i * 0.11, len: 0.3, gain: 0.14, type: "sine" as const })),
  lose: [392, 330, 262].map((f, i) => ({ freq: f, at: i * 0.16, len: 0.34, gain: 0.14, type: "triangle" as const })),
};

function noiseBurst(at: number, len: number, gain: number, cutoff: number, kind: BiquadFilterType): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * len));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    filter.type = kind;
    filter.frequency.value = cutoff;
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + 0.01 + at);
  } catch {
    // Best-effort, like every cue.
  }
}

function playOne(id: SfxId, at: number): void {
  if (id === "draw") return noiseBurst(at, 0.09, 0.09, 3200, "bandpass");
  if (id === "tuck") return noiseBurst(at, 0.05, 0.08, 1400, "lowpass");
  if (id === "riffle") {
    // A quick run of card flicks.
    for (let i = 0; i < 7; i++) noiseBurst(at + i * 0.032, 0.03, 0.05 + i * 0.004, 3800, "bandpass");
    return;
  }
  if (id === "ko") {
    noiseBurst(at, 0.18, 0.14, 900, "lowpass");
    playNotes([{ freq: 170, at, len: 0.26, gain: 0.2, type: "sine", to: 60 }]);
    return;
  }
  playNotes(NOTES[id].map((n) => ({ ...n, at: n.at + at })));
}

const STAGGER = 0.11;
const lastPlayed = new Map<SfxId, number>();

/** Play merged cues one after another; the same cue never repeats inside 150ms. */
export function playSfx(ids: readonly SfxId[], now = Date.now()): void {
  let slot = 0;
  for (const id of mergeSfx(ids)) {
    if (now - (lastPlayed.get(id) ?? -Infinity) < 150) continue;
    lastPlayed.set(id, now);
    playOne(id, slot++ * STAGGER);
  }
}

/**
 * Sound effects for draws, plays, attacks, blocks, counters, K.O.s, DON!!,
 * triggers and the result. `sound` = the master Sounds setting; `muted` =
 * hotseat hand-over / auto-pass. State is tracked while off so turning
 * sound on never replays the past.
 */
export function useGameSfx(
  view: PlayerView | null,
  battleLog: readonly BattleLogEntry[],
  opts: { sound: boolean; muted: boolean; spectating: boolean },
): void {
  const { sound, muted, spectating } = opts;
  const on = sound && !muted;

  const prevView = useRef<PlayerView | null>(null);
  const prevWinner = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevView.current;
    const pw = prevWinner.current;
    prevView.current = view;
    prevWinner.current = view ? view.winner : undefined;
    if (!view || !on) return;
    const ids = prev ? viewSfx(motionCues(prev, view)) : [];
    const result = resultSfx(pw, view.winner, view.seat, spectating);
    playSfx(result ? [...ids, result] : ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const lastId = battleLog.length ? battleLog[battleLog.length - 1]!.id : null;
  const prevLogId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevLogId.current;
    prevLogId.current = lastId;
    if (!on) return;
    playSfx(logSfx(newLogEntries(prev, battleLog), spectating));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);
}
