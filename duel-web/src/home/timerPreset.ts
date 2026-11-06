/** Private-room timer presets (ranked always forces a 15 minute chess clock per player). */
export type TimerPreset = "off" | "turn_30" | "seat_15m" | "turn_30_seat_15m";

export const TIMER_PRESET_OPTIONS: ReadonlyArray<{ value: TimerPreset; label: string }> = [
  { value: "off", label: "No timer" },
  { value: "turn_30", label: "30 second turns" },
  { value: "seat_15m", label: "15 minutes per player" },
  { value: "turn_30_seat_15m", label: "30s turns + 15 min per player" },
];

export function timerFromPreset(preset: TimerPreset): {
  turnSeconds?: number;
  seatSeconds?: number;
} {
  switch (preset) {
    case "turn_30":
      return { turnSeconds: 30 };
    // Chess clock: 15 minutes each, ticking only while it's that player's move.
    case "seat_15m":
      return { seatSeconds: 15 * 60 };
    case "turn_30_seat_15m":
      return { turnSeconds: 30, seatSeconds: 15 * 60 };
    default:
      return {};
  }
}
