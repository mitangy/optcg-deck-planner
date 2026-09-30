import { currentSettings } from "../settings";

/** Named vibration patterns (ms). Android only: iOS Safari has no vibration API. */
const PATTERNS = {
  /** Lifting a card or DON!!. */
  pickup: 12,
  /** A drag that landed. */
  drop: 22,
  /** An attack against you. */
  attack: [45, 70, 45],
  /** The game needs you. */
  turn: 60,
} as const satisfies Record<string, number | number[]>;

export type BuzzKind = keyof typeof PATTERNS;

/**
 * Vibrate for a named cue where the browser can, and do nothing elsewhere.
 * Follows the Vibration setting; the small pickup / drop taps also stay quiet
 * under "Reduce animations", while attack and turn alerts always come through.
 */
export function buzz(kind: BuzzKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const s = currentSettings();
  if (!s.turnAlert) return;
  if (s.reduceMotion && (kind === "pickup" || kind === "drop")) return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    // Vibration blocked (no user activation, policy): best-effort only.
  }
}
