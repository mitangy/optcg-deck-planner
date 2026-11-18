export interface TimerHandle {
  clear(): void;
}

export interface DuelTime {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  setInterval(fn: () => void, ms: number): TimerHandle;
  sleep(ms: number): Promise<void>;
}

export type ClockOwner = { clock: { setTimeout(fn: () => void, ms: number): TimerHandle } };

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

export const duelTimeSource: { create: ((owner: ClockOwner) => DuelTime) | null } = { create: null };
