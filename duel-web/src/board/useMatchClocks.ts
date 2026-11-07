import { useEffect, useState } from "react";
import type { Seat, TimerMessage } from "../net/protocol";
import type { SeatClocks } from "./TurnStatusPanel";

export function formatCountdown(endsAt: number | null | undefined, now: number): string | null {
  if (endsAt == null) return null;
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** Chess-clock readouts for both seats, or null when that mode is off. */
export function seatClockLabels(
  timer: TimerMessage | null,
  now: number,
  youSeat: Seat,
  oppSeat: Seat,
): SeatClocks | null {
  if (!timer?.seatSeconds || !timer.seatRemainingMs) return null;
  const msFor = (seat: Seat) =>
    timer.clockSeat === seat && timer.clockEndsAt != null
      ? Math.max(0, timer.clockEndsAt - now)
      : Math.max(0, timer.seatRemainingMs![seat]);
  const fmt = (ms: number) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  const you = msFor(youSeat);
  const opp = msFor(oppSeat);
  return {
    you: fmt(you),
    opp: fmt(opp),
    youLow: you < 60_000,
    oppLow: opp < 60_000,
    running: timer.clockSeat === youSeat ? "you" : timer.clockSeat === oppSeat ? "opp" : null,
  };
}

/** The current time, ticking every 250 ms only while a turn / match / seat clock or the reconnect window is running. */
export function useClockNow(timer: TimerMessage | null, opponentAwayUntil: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer?.turnEndsAt && !timer?.matchEndsAt && !timer?.clockEndsAt && !opponentAwayUntil) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer?.turnEndsAt, timer?.matchEndsAt, timer?.clockEndsAt, opponentAwayUntil]);
  return now;
}
