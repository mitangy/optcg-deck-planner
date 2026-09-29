import { useEffect, useRef } from "react";

const TITLE_MARK = "● Your move · ";

let audio: AudioContext | null = null;

/** Two soft rising notes, synthesized so there is no sound file to ship. */
export function playTurnChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
    const start = audio.currentTime + 0.01;
    [660, 880].forEach((freq, i) => {
      const t = start + i * 0.12;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    // Audio blocked or unsupported: the alert is best-effort.
  }
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
  const { buzz, sound } = opts;

  useEffect(() => {
    const rose = needsYou && !prev.current;
    prev.current = needsYou;
    if (!needsYou) clearTitleMark();
    if (!rose) return;
    if (buzz) navigator.vibrate?.(60);
    if (sound) playTurnChime();
    if (buzz && document.hidden && !document.title.startsWith(TITLE_MARK)) {
      document.title = TITLE_MARK + document.title;
    }
  }, [needsYou, buzz, sound]);

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
