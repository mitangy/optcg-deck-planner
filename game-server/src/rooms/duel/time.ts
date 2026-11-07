/** A pending timer; `clear()` cancels it and is safe to call twice. */
export interface TimerHandle {
  clear(): void;
}

/**
 * Everything the duel room asks of the wall clock: "what time is it", delayed calls and sleeping.
 * Rooms use real time; tests install a fake with `duelTimeSource.create` so clock, bot-pacing and
 * retry tests advance time instead of waiting for it.
 */
export interface DuelTime {
  now(): number;
  /** Runs `fn` once after `ms` (a room-lifetime timer: it dies with the room). */
  setTimeout(fn: () => void, ms: number): TimerHandle;
  /** Runs `fn` every `ms` until cleared. */
  setInterval(fn: () => void, ms: number): TimerHandle;
  sleep(ms: number): Promise<void>;
}

/** The slice of a Colyseus room the real time source needs. */
export type ClockOwner = { clock: { setTimeout(fn: () => void, ms: number): TimerHandle } };

/** Real time: Date.now(), the room's Colyseus clock for delayed calls, a plain interval for the tick loop. */
export function realTime(owner: ClockOwner): DuelTime {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => owner.clock.setTimeout(fn, ms),
    setInterval: (fn, ms) => {
      const id = setInterval(fn, ms);
      return { clear: () => clearInterval(id) };
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** Tests set `create` to hand every new room a fake `DuelTime` (it gets the room, to wrap real time where it wants to); null (the default) is real time. */
export const duelTimeSource: { create: ((owner: ClockOwner) => DuelTime) | null } = { create: null };
