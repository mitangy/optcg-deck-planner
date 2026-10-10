/**
 * Moving around a built timeline. Remembers the states it has already worked out (a small LRU),
 * so stepping back and forth is instant, and otherwise re-applies at most a checkpoint's worth of moves.
 */
import { timelineStateAt, type MatchState, type ReplayTimeline } from "@optcg/rules/replayTimeline";

const CACHE_SIZE = 32;

export type ReplayCursor = {
  /** The state after `step` moves (0 = as dealt). Treat it as read-only. */
  stateAt(step: number): MatchState;
};

export function createReplayCursor(t: ReplayTimeline, size = CACHE_SIZE): ReplayCursor {
  // Map keeps insertion order: the first key is the least recently used.
  const cache = new Map<number, MatchState>();
  const remember = (step: number, state: MatchState) => {
    cache.delete(step);
    cache.set(step, state);
    if (cache.size > size) cache.delete(cache.keys().next().value!);
  };
  return {
    stateAt(step) {
      const target = Math.min(Math.max(0, Math.floor(step)), t.steps.length);
      const hit = cache.get(target);
      if (hit) {
        remember(target, hit);
        return hit;
      }
      // Start from the closest state we hold at or before the target, if that beats a checkpoint.
      let near: { step: number; state: MatchState } | undefined;
      for (const [s, state] of cache) if (s <= target && (!near || s > near.step)) near = { step: s, state };
      const state = timelineStateAt(t, target, near);
      remember(target, state);
      return state;
    },
  };
}

/** The first step of turn `turn`, or null when the game has no such turn. */
export function turnStep(t: Pick<ReplayTimeline, "turnStarts">, turn: number): number | null {
  return t.turnStarts.find((s) => s.turn === turn)?.step ?? null;
}

/** The first step of the next turn, or the last step when there is none. */
export function nextTurnStep(t: Pick<ReplayTimeline, "turnStarts" | "steps">, step: number): number {
  return t.turnStarts.find((s) => s.step > step)?.step ?? t.steps.length;
}

/** The start of this turn, or of the one before when already on a turn's first step. */
export function prevTurnStep(t: Pick<ReplayTimeline, "turnStarts">, step: number): number {
  let found = 0;
  for (const s of t.turnStarts) if (s.step < step) found = s.step;
  return found;
}

/** The turn a step belongs to. */
export function turnAtStep(t: Pick<ReplayTimeline, "turnStarts">, step: number): number {
  let turn = t.turnStarts[0]?.turn ?? 1;
  for (const s of t.turnStarts) if (s.step <= step) turn = s.turn;
  return turn;
}

export const PLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type PlaySpeed = (typeof PLAY_SPEEDS)[number];

/** Milliseconds to wait before the next step while playing; a new turn lingers a little longer. */
export function playDelay(speed: PlaySpeed, crossesTurn: boolean): number {
  return Math.round((900 / speed) * (crossesTurn ? 1.5 : 1));
}
