export type ReplayStatus =
  | { kind: "unavailable"; reason: "schema" | "start" | "first-move" }
  | { kind: "partial"; steps: number; atIntent: number }
  | { kind: "drift"; reason: "version" | "outcome" }
  | { kind: "exact" };

export type ReplayStatusInput = {
  replay: { schema: number; rulesVersion: string; registryHash: string; end?: { winner: 0 | 1; reason: string } };
  current: { rulesVersion: string; registryHash: string };
  startFailed: boolean;
  timeline: {
    steps: number;
    diverged?: { atIntent: number };
    winner: 0 | 1 | null;
    turnNumber: number;
  } | null;
  recordedTurns: number | null;
};

export const SUPPORTED_REPLAY_SCHEMA = 1;

export function replayStatus(i: ReplayStatusInput): ReplayStatus {
  if (i.replay.schema !== SUPPORTED_REPLAY_SCHEMA) return { kind: "unavailable", reason: "schema" };
  if (i.startFailed || !i.timeline) return { kind: "unavailable", reason: "start" };
  const { diverged } = i.timeline;
  if (diverged) {
    return diverged.atIntent === 0
      ? { kind: "unavailable", reason: "first-move" }
      : { kind: "partial", steps: i.timeline.steps, atIntent: diverged.atIntent };
  }
  if (i.replay.rulesVersion !== i.current.rulesVersion || i.replay.registryHash !== i.current.registryHash) {
    return { kind: "drift", reason: "version" };
  }
  const endedDifferently = i.replay.end != null && i.timeline.winner != null && i.timeline.winner !== i.replay.end.winner;
  const lengthDiffers = i.recordedTurns != null && i.timeline.turnNumber !== i.recordedTurns;
  if (endedDifferently || lengthDiffers) return { kind: "drift", reason: "outcome" };
  return { kind: "exact" };
}
