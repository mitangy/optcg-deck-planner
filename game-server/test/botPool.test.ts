import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { BotPool, type BotJobInput } from "../src/botPool.js";
import type { BotJob } from "../src/botWorker.js";

/** A worker that answers jobs when the test says so. */
class FakeWorker extends EventEmitter {
  jobs: BotJob[] = [];
  terminated = false;
  postMessage(job: BotJob) { this.jobs.push(job); }
  terminate() { this.terminated = true; return Promise.resolve(0); }
  unref() { return this; }
  answer(job: BotJob, intent: unknown = { type: "end_turn" }) { this.emit("message", { id: job.id, intent, searched: true, ms: 1 }); }
}

const input = (seed = 1): BotJobInput => ({ state: {} as BotJobInput["state"], seat: 1, seed, memory: { count: 0, activated: [] }, budgetMs: 10 });
const tick = () => new Promise((r) => setTimeout(r, 5));

function pool(size = 1) {
  const workers: FakeWorker[] = [];
  const p = new BotPool({ size, spawn: () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; } });
  return { p, workers };
}

describe("bot worker pool (#635)", () => {
  it("runs a job on a worker and returns its answer (#635)", async () => {
    const { p, workers } = pool();
    const result = p.run(input(), 1000);
    await tick();
    assert.equal(workers.length, 1);
    workers[0]!.answer(workers[0]!.jobs[0]!, { type: "pass_block" });
    assert.deepEqual((await result).intent, { type: "pass_block" });
    await p.close();
  });

  it("runs one job at a time per worker, in the order they were submitted, and reuses the worker (#635)", async () => {
    const { p, workers } = pool(1);
    const a = p.run(input(1), 1000);
    const b = p.run(input(2), 1000);
    const c = p.run(input(3), 1000);
    await tick();
    assert.equal(workers[0]!.jobs.length, 1, "the others wait");
    assert.equal(p.load, 3);
    workers[0]!.answer(workers[0]!.jobs[0]!);
    await a;
    await tick();
    assert.equal(workers.length, 1, "no second worker was started");
    assert.equal(workers[0]!.jobs[1]!.seed, 2);
    workers[0]!.answer(workers[0]!.jobs[1]!);
    await b;
    await tick();
    assert.equal(workers[0]!.jobs[2]!.seed, 3);
    workers[0]!.answer(workers[0]!.jobs[2]!);
    await c;
    await p.close();
  });

  it("a job that outlives its timeout is rejected, its worker is terminated and the next job gets a fresh worker (#635)", async () => {
    const { p, workers } = pool(1);
    await assert.rejects(p.run(input(), 30), /timed out/);
    assert.equal(workers[0]!.terminated, true);
    const next = p.run(input(3), 1000);
    await tick();
    assert.equal(workers.length, 2);
    workers[1]!.answer(workers[1]!.jobs[0]!);
    await next;
    await p.close();
  });

  it("cancelling a running job frees its worker and rejects the job; cancelling a queued job never runs it (#635)", async () => {
    const { p, workers } = pool(1);
    let runningId = 0;
    let queuedId = 0;
    const running = p.run(input(1), 1000, (id) => { runningId = id; });
    const queued = p.run(input(2), 1000, (id) => { queuedId = id; });
    const third = p.run(input(3), 1000);
    await tick();
    p.cancel(queuedId);
    await assert.rejects(queued, /cancelled/);
    p.cancel(runningId);
    await assert.rejects(running, /cancelled/);
    assert.equal(workers[0]!.terminated, true);
    await tick();
    assert.equal(workers.length, 2, "the third job runs on a fresh worker");
    assert.deepEqual(workers[1]!.jobs.map((j) => j.seed), [3]);
    workers[1]!.answer(workers[1]!.jobs[0]!);
    await third;
    await p.close();
  });

  it("a worker error rejects the job it was running (#635)", async () => {
    const { p, workers } = pool();
    const r = p.run(input(), 1000);
    await tick();
    workers[0]!.emit("message", { id: workers[0]!.jobs[0]!.id, error: "boom" });
    await assert.rejects(r, /boom/);
    await p.close();
  });

  it("a pool of size 0 is switched off and refuses work (#635)", async () => {
    const off = new BotPool({ size: 0 });
    assert.equal(off.enabled(), false);
    await assert.rejects(off.run(input(), 1000), /unavailable/);
    assert.equal(new BotPool({ size: 1 }).enabled(), true);
  });

  it("an idle worker is shut down after a while and the next job starts a new one (#635)", async () => {
    const workers: FakeWorker[] = [];
    const p = new BotPool({ size: 1, idleMs: 30, spawn: () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; } });
    const first = p.run(input(1), 1000);
    await tick();
    workers[0]!.answer(workers[0]!.jobs[0]!);
    await first;
    assert.equal(workers[0]!.terminated, false, "kept for the next job");
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(workers[0]!.terminated, true);
    const second = p.run(input(2), 1000);
    await tick();
    assert.equal(workers.length, 2);
    workers[1]!.answer(workers[1]!.jobs[0]!);
    await second;
    await p.close();
  });
});
