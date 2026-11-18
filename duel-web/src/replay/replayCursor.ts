import { timelineStateAt, type MatchState, type ReplayTimeline } from "@optcg/rules/replay/replayTimeline";

const CACHE_SIZE = 32;

export type ReplayCursor = {
  stateAt(step: number): MatchState;
};

export function createReplayCursor(t: ReplayTimeline, size = CACHE_SIZE): ReplayCursor {
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
      let near: { step: number; state: MatchState } | undefined;
      for (const [s, state] of cache) if (s <= target && (!near || s > near.step)) near = { step: s, state };
      const state = timelineStateAt(t, target, near);
      remember(target, state);
      return state;
    },
  };
}

export function turnStep(t: Pick<ReplayTimeline, "turnStarts">, turn: number): number | null {
  return t.turnStarts.find((s) => s.turn === turn)?.step ?? null;
}

export function nextTurnStep(t: Pick<ReplayTimeline, "turnStarts" | "steps">, step: number): number {
  return t.turnStarts.find((s) => s.step > step)?.step ?? t.steps.length;
}

export function prevTurnStep(t: Pick<ReplayTimeline, "turnStarts">, step: number): number {
  let found = 0;
  for (const s of t.turnStarts) if (s.step < step) found = s.step;
  return found;
}

export function turnAtStep(t: Pick<ReplayTimeline, "turnStarts">, step: number): number {
  let turn = t.turnStarts[0]?.turn ?? 1;
  for (const s of t.turnStarts) if (s.step <= step) turn = s.turn;
  return turn;
}

export const PLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type PlaySpeed = (typeof PLAY_SPEEDS)[number];

export function playDelay(speed: PlaySpeed, crossesTurn: boolean): number {
  return Math.round((900 / speed) * (crossesTurn ? 1.5 : 1));
}
