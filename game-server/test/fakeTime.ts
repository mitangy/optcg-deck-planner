import { duelTimeSource, realTime, type ClockOwner, type DuelTime, type TimerHandle } from "../src/rooms/duel/time.js";

type Pending = { at: number; seq: number; run: () => void; every?: number; cleared: boolean };

/** Lets queued promise callbacks (the room's awaited work) run between fake timer firings. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * A DuelTime whose clock only moves when a test calls `advance`: timers fire in order at their
 * virtual time, so clock, pacing and retry tests need no real waiting.
 */
export class FakeTime implements DuelTime {
  private t = 1_700_000_000_000;
  private seq = 0;
  private timers: Pending[] = [];

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    return this.add(fn, ms);
  }

  setInterval(fn: () => void, ms: number): TimerHandle {
    return this.add(fn, ms, ms);
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.add(resolve, ms));
  }

  private add(run: () => void, ms: number, every?: number): TimerHandle {
    const timer: Pending = { at: this.t + ms, seq: (this.seq += 1), run, every, cleared: false };
    this.timers.push(timer);
    return {
      clear: () => {
        timer.cleared = true;
      },
    };
  }

  /** Move the clock forward `ms`, firing every timer that comes due on the way, oldest first. */
  async advance(ms: number): Promise<void> {
    await settle(); // work the room queued just before this call (a leave, a message) has run
    const end = this.t + ms;
    for (;;) {
      this.timers = this.timers.filter((x) => !x.cleared);
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.t = Math.max(this.t, due.at);
      if (due.every !== undefined) {
        due.at += due.every;
        due.seq = (this.seq += 1);
      } else {
        due.cleared = true;
      }
      due.run();
      await settle();
    }
    this.t = end;
    await settle();
  }

  /** Every room created from now on runs on this clock. Call `uninstall` when the test ends. */
  install(): this {
    duelTimeSource.create = () => this;
    return this;
  }

  uninstall(): void {
    duelTimeSource.create = null;
  }
}

/**
 * Real time, except that `sleep` waits for the test: it records each requested delay and resolves
 * it on `release()`. For retry loops whose back-off should be checked, not waited out.
 */
export class ManualSleepTime implements DuelTime {
  readonly requested: number[] = [];
  private waiting: (() => void)[] = [];
  /** Real time of the room this was handed to. */
  private real!: DuelTime;

  now = () => this.real.now();
  setTimeout = (fn: () => void, ms: number) => this.real.setTimeout(fn, ms);
  setInterval = (fn: () => void, ms: number) => this.real.setInterval(fn, ms);

  sleep(ms: number): Promise<void> {
    this.requested.push(ms);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Let every pending sleep finish. */
  release(): void {
    const all = this.waiting;
    this.waiting = [];
    for (const resolve of all) resolve();
  }

  install(): this {
    duelTimeSource.create = (owner: ClockOwner) => {
      this.real = realTime(owner);
      return this;
    };
    return this;
  }

  uninstall(): void {
    duelTimeSource.create = null;
  }
}

/** Runs `fn` with every room created inside it on a clock that only moves when the test advances it. */
export async function withFakeTime<T>(fn: (time: FakeTime) => Promise<T>): Promise<T> {
  const time = new FakeTime().install();
  try {
    return await fn(time);
  } finally {
    time.uninstall();
  }
}
