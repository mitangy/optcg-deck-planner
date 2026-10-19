/**
 * A small pool of worker threads that run the Hard bot's search (#635), so a 1.5 second lookahead never blocks a room's
 * event loop (and with it every other game on the process). Size comes from BOT_WORKERS (default 1: the Render
 * starter instance has one CPU, so a second worker would only compete with the game loop).
 *
 * `run` answers with the worker's result, or rejects when the worker fails, the job times out or the job is cancelled;
 * the caller then plays a Normal move in its own thread. A worker that failed or timed out is terminated and a fresh one
 * is started for the next job. Workers start on first use, so a server that never hosts a Hard bot never pays for them.
 */
import { Worker } from "node:worker_threads";
import type { BotJob, BotJobResult } from "./botWorker.js";

export type BotJobInput = Omit<BotJob, "id">;
export type BotJobOutput = Extract<BotJobResult, { intent: unknown }>;

interface Pending {
  job: BotJob;
  resolve(r: BotJobOutput): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout | null;
  worker: Worker | null;
  timeoutMs: number;
}

export interface BotPoolOptions {
  size?: number;
  /** Created per worker; tests pass a stub. */
  spawn?: () => Worker;
  idleMs?: number;
}

const defaultSpawn = (): Worker => {
  const w = new Worker(new URL("./botWorkerEntry.mjs", import.meta.url));
  w.unref(); // an idle worker never keeps the process alive
  return w;
};

export class BotPool {
  private readonly size: number;
  private readonly spawn: () => Worker;
  private idle: Worker[] = [];
  private idleTimer: NodeJS.Timeout | null = null;
  /** An idle worker is shut down after this long (each holds about 150 MB of card data); the next job starts a new one. */
  readonly idleMs: number;
  private busy = 0;
  private queue: Pending[] = [];
  private nextId = 1;
  private pendingById = new Map<number, Pending>();
  private closed = false;

  constructor(opts: BotPoolOptions = {}) {
    this.size = Math.max(0, opts.size ?? 1);
    this.spawn = opts.spawn ?? defaultSpawn;
    this.idleMs = opts.idleMs ?? 120_000;
  }

  /** False when the pool has no workers to offer (size 0 or closed): the room then searches in its own thread. */
  enabled(): boolean { return !this.closed && this.size > 0; }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.busy > 0) return;
      const all = this.idle;
      this.idle = [];
      for (const w of all) void w.terminate();
    }, this.idleMs);
    this.idleTimer.unref();
  }

  /** Start one idle worker ahead of the first job (loading the card data takes most of a second). */
  warm(): void {
    if (this.closed || this.size === 0 || this.idle.length + this.busy > 0) return;
    try { this.idle.push(this.spawn()); this.armIdleTimer(); } catch { /* the first job reports it */ }
  }

  /** Jobs running plus waiting. */
  get load(): number { return this.busy + this.queue.length; }

  /** Run one search. `timeoutMs` counts from now, queue time included. Resolves with a job id through `onId` so the caller can cancel. */
  run(input: BotJobInput, timeoutMs: number, onId?: (id: number) => void): Promise<BotJobOutput> {
    if (this.closed || this.size === 0) return Promise.reject(new Error("bot pool unavailable"));
    return new Promise<BotJobOutput>((resolve, reject) => {
      const job: BotJob = { ...input, id: this.nextId++ };
      const p: Pending = { job, resolve, reject, timer: null, worker: null, timeoutMs };
      this.pendingById.set(job.id, p);
      p.timer = setTimeout(() => this.fail(p, new Error(`bot job timed out after ${timeoutMs} ms`), true), timeoutMs);
      onId?.(job.id);
      this.queue.push(p);
      this.pump();
    });
  }

  /** Drop a job whose answer is no longer wanted. A running job costs its worker, which is replaced. */
  cancel(id: number): void {
    const p = this.pendingById.get(id);
    if (p) this.fail(p, new Error("bot job cancelled"), true);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const p of [...this.pendingById.values()]) this.fail(p, new Error("bot pool closed"), true);
    const all = this.idle;
    this.idle = [];
    await Promise.all(all.map((w) => w.terminate()));
  }

  private pump(): void {
    while (this.queue.length && this.busy < this.size && !this.closed) {
      const p = this.queue.shift()!;
      if (!this.pendingById.has(p.job.id)) continue;
      let worker: Worker;
      try {
        worker = this.idle.pop() ?? this.spawn();
      } catch (e) {
        this.fail(p, e instanceof Error ? e : new Error(String(e)), false);
        continue;
      }
      p.worker = worker;
      this.busy += 1;
      const onMessage = (m: BotJobResult): void => {
        if (m.id !== p.job.id) return;
        cleanup();
        this.busy -= 1;
        this.finish(p);
        this.idle.push(worker);
        this.armIdleTimer();
        if ("error" in m) p.reject(new Error(m.error)); else p.resolve(m);
        this.pump();
      };
      const onError = (e: Error): void => {
        cleanup();
        this.busy -= 1;
        void worker.terminate();
        this.finish(p);
        p.reject(e);
        this.pump();
      };
      const onExit = (): void => onError(new Error("bot worker exited"));
      const cleanup = (): void => { worker.off("message", onMessage); worker.off("error", onError); worker.off("exit", onExit); };
      (p as Pending & { cleanup?: () => void }).cleanup = cleanup;
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
      worker.postMessage(p.job);
    }
  }

  private finish(p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    this.pendingById.delete(p.job.id);
  }

  /** Reject a job; a job already on a worker takes that worker down with it (its search cannot be interrupted). */
  private fail(p: Pending, error: Error, terminate: boolean): void {
    if (!this.pendingById.has(p.job.id)) return;
    this.finish(p);
    const queued = this.queue.indexOf(p);
    if (queued >= 0) this.queue.splice(queued, 1);
    else if (p.worker && terminate) {
      (p as Pending & { cleanup?: () => void }).cleanup?.();
      this.busy -= 1;
      void p.worker.terminate();
      this.pump();
    }
    p.reject(error);
  }
}

/** The pool the game server's rooms share. */
let shared: BotPool | null = null;
export function sharedBotPool(): BotPool {
  const size = Number(process.env.BOT_WORKERS ?? 1);
  return (shared ??= new BotPool({ size: Number.isFinite(size) ? size : 1 }));
}
/** For tests: drop the shared pool (closing its workers) so the next use starts fresh. */
export async function resetSharedBotPool(): Promise<void> {
  const p = shared;
  shared = null;
  await p?.close();
}
/** For tests: use `pool` for every room (null restores the default). */
export function setSharedBotPool(pool: BotPool | null): void {
  shared = pool;
}
