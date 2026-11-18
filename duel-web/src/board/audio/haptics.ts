import { currentSettings } from "../../settings";

// Android only: iOS Safari has no vibration API.
const PATTERNS = {
  pickup: 12,
  drop: 22,
  attack: [45, 70, 45],
  turn: 60,
} as const satisfies Record<string, number | number[]>;

export type BuzzKind = keyof typeof PATTERNS;

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
