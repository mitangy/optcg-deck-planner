import { useEffect, useRef } from "react";
import { buzz } from "./haptics";

const TITLE_MARK = "● Your move · ";

let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/**
 * iOS keeps audio locked until a sound is started inside a user gesture, and a
 * cue fired later by the game (an attack arriving) is not one. Call this from
 * a pointerdown: it resumes the context and plays one silent sample.
 */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // Already unlocked, or audio is unavailable.
  }
}

/** Whether audio has been unlocked (running context). */
export function audioUnlocked(): boolean {
  return audio?.state === "running";
}

type Note = { freq: number; at: number; len: number; gain: number; type: OscillatorType };

function playNotes(notes: Note[]): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const start = ctx.currentTime + 0.01;
    for (const n of notes) {
      const t = start + n.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(n.gain, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.len + 0.02);
    }
  } catch {
    // Audio blocked or unsupported: the alert is best-effort.
  }
}

/** Two soft rising notes, synthesized so there is no sound file to ship. */
export function playTurnChime(): void {
  playNotes([
    { freq: 660, at: 0, len: 0.28, gain: 0.18, type: "sine" },
    { freq: 880, at: 0.12, len: 0.28, gain: 0.18, type: "sine" },
  ]);
}

/** Lower, falling two-tone "incoming" cue: clearly not the turn chime. */
export function playAttackCue(): void {
  playNotes([
    { freq: 392, at: 0, len: 0.18, gain: 0.2, type: "triangle" },
    { freq: 262, at: 0.14, len: 0.3, gain: 0.22, type: "triangle" },
  ]);
}

/** One short, dry tick when the opponent uses a card: quieter and shorter than the chime. */
export function playOpponentPlayCue(): void {
  playNotes([{ freq: 494, at: 0, len: 0.1, gain: 0.11, type: "sine" }]);
}

/** Low thud when you lose a Life card: no pitch movement, so it cannot pass for the attack cue. */
export function playLifeLostCue(): void {
  playNotes([
    { freq: 110, at: 0, len: 0.22, gain: 0.3, type: "sine" },
    { freq: 165, at: 0, len: 0.1, gain: 0.08, type: "sawtooth" },
  ]);
}

/** Softer, higher thud when the opponent loses a Life card. */
export function playOppLifeLostCue(): void {
  playNotes([{ freq: 196, at: 0, len: 0.14, gain: 0.11, type: "sine" }]);
}

function clearTitleMark() {
  if (document.title.startsWith(TITLE_MARK)) {
    document.title = document.title.slice(TITLE_MARK.length);
  }
}

/**
 * Buzz / chime / flag the tab when the game starts waiting on you (your turn,
 * a block or counter step, an effect choice). Fires on the rising edge only,
 * so it does not repeat while you play out your turn.
 */
export function useTurnAlert(needsYou: boolean, opts: { buzz: boolean; sound: boolean }): void {
  const prev = useRef(false);
  const { buzz: buzzOn, sound } = opts;

  useEffect(() => {
    const rose = needsYou && !prev.current;
    prev.current = needsYou;
    if (!needsYou) clearTitleMark();
    if (!rose) return;
    if (buzzOn) buzz("turn");
    if (sound) playTurnChime();
    if (buzzOn && document.hidden && !document.title.startsWith(TITLE_MARK)) {
      document.title = TITLE_MARK + document.title;
    }
  }, [needsYou, buzzOn, sound]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) clearTitleMark();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTitleMark();
    };
  }, []);
}
