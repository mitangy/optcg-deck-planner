import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { LatestOnlySender, MatchResultOutbox, OutboxScheduler, type OutboxDatabase } from "../src/writeback.js";

describe("LatestOnlySender", () => {
  it("sends one at a time and skips to the newest snapshot (#316)", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const sender = new LatestOnlySender<string>(async (payload) => {
      sent.push(payload);
      if (payload === "turn 1") await new Promise<void>((r) => { release = r; });
    });
    const done = sender.push("turn 1");
    void sender.push("turn 2");
    void sender.push("turn 3");
    release();
    await done;
    assert.deepEqual(sent, ["turn 1", "turn 3"]);
  });

  it("a failed send doesn't stop the next snapshot (#316)", async () => {
    const sent: string[] = [];
    const errors: unknown[] = [];
    const sender = new LatestOnlySender<string>(async (payload) => {
      if (payload === "turn 1") throw new Error("API down");
      sent.push(payload);
    }, (e) => errors.push(e));
    await sender.push("turn 1");
    await sender.push("turn 2");
    assert.deepEqual(sent, ["turn 2"]);
    assert.equal(errors.length, 1);
  });
});

describe("MatchResultOutbox wake-ups", () => {
  const payload = (match_id: string) => ({
    match_id, seat0_user_id: 1, seat1_user_id: 2, winner_seat: 0 as const, reason: "leader_battle_at_zero_life", ranked: false,
  });
  const ok = (async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
  const down = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

  async function freshOutbox(send: typeof fetch) {
    const db = new PGlite();
    const outbox = new MatchResultOutbox(db as unknown as OutboxDatabase, send);
    await outbox.initialize();
    return { db, outbox };
  }

  it("reports nothing due once every result is delivered, so an idle server never queries (#389)", async () => {
    const { db, outbox } = await freshOutbox(ok);
    assert.equal(await outbox.nextDueInMs(), null);
    await outbox.enqueue(payload("m1"));
    assert.equal(await outbox.nextDueInMs(), 0);
    await outbox.drain();
    assert.equal(await outbox.nextDueInMs(), null);
    await db.close();
  });

  it("reports when a failed delivery's retry falls due (#389)", async () => {
    const { db, outbox } = await freshOutbox(down);
    await outbox.enqueue(payload("m1"));
    await outbox.drain();
    const wait = await outbox.nextDueInMs();
    assert.ok(wait !== null && wait > 0 && wait <= 8000, `retry wait ${wait}`);
    await db.close();
  });
});

describe("OutboxScheduler", () => {
  function fakeOutbox(due: number | null) {
    const calls = { drains: 0, enqueued: [] as string[] };
    return {
      calls,
      outbox: {
        async enqueue(p: { match_id: string }) { calls.enqueued.push(p.match_id); },
        async drain() { calls.drains += 1; },
        async nextDueInMs() { return due; },
      },
    };
  }

  it("sets no timer when nothing is waiting, so the database can sleep (#389)", async () => {
    const { outbox, calls } = fakeOutbox(null);
    const timers: number[] = [];
    const scheduler = new OutboxScheduler(outbox as never, (_fn, ms) => { timers.push(ms); return 0 as never; }, () => {});
    await scheduler.kick();
    assert.equal(calls.drains, 1);
    assert.deepEqual(timers, []);
  });

  it("wakes up when a retry falls due (#389)", async () => {
    const { outbox } = fakeOutbox(5000);
    const timers: number[] = [];
    const scheduler = new OutboxScheduler(outbox as never, (_fn, ms) => { timers.push(ms); return 0 as never; }, () => {});
    await scheduler.kick();
    assert.deepEqual(timers, [5000]);
  });

  it("delivers a queued result right away instead of waiting for a poll (#389)", async () => {
    const { outbox, calls } = fakeOutbox(null);
    const scheduler = new OutboxScheduler(outbox as never, () => 0 as never, () => {});
    await scheduler.enqueue({ match_id: "m9" } as never);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls.enqueued, ["m9"]);
    assert.equal(calls.drains, 1);
  });
});
