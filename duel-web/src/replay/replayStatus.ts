/**
 * Can this recording be watched, and should the viewer say it may not match what happened?
 * Recordings are re-run on today's rules, which may have changed since the game was played,
 * so the viewer always tries and reports how far it got.
 */

export type ReplayStatus =
  /** Nothing to show: the recording cannot be dealt, or its first move is already refused. */
  | { kind: "unavailable"; reason: "schema" | "start" | "first-move" }
  /** Plays up to `steps` moves, then the engine refuses the next one. */
  | { kind: "partial"; steps: number; atIntent: number }
  /** Plays through, but the rules differ from when it was recorded. */
  | { kind: "drift"; reason: "version" | "outcome" }
  | { kind: "exact" };

export type ReplayStatusInput = {
  replay: { schema: number; rulesVersion: string; registryHash: string; end?: { winner: 0 | 1; reason: string } };
  /** The rules this build runs. */
  current: { rulesVersion: string; registryHash: string };
  /** Dealing the match threw (for example a card the engine no longer knows). */
  startFailed: boolean;
  timeline: {
    steps: number;
    diverged?: { atIntent: number };
    /** The engine's own winner after the last step; null when the game ended outside the engine (concede, time) or not at all. */
    winner: 0 | 1 | null;
    turnNumber: number;
  } | null;
  /** The turn count the server recorded for the game. */
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
