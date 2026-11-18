"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { liveMatchesOf, waitForIdle } = require("./wait-for-idle.cjs");

function harness(answers, maxWaitMs = 120_000) {
  let t = 0;
  const calls = [];
  return {
    calls,
    run: () =>
      waitForIdle({
        getHealth: async () => {
          const a = answers[Math.min(calls.length, answers.length - 1)];
          calls.push(t);
          if (a instanceof Error) throw a;
          return a;
        },
        sleep: async (ms) => void (t += ms),
        now: () => t,
        maxWaitMs,
        intervalMs: 30_000,
      }),
  };
}

test("an idle server is deployed to on the first poll (#1352)", async () => {
  const h = harness([{ liveMatches: 0 }]);
  assert.deepEqual(await h.run(), { idle: true, polls: 1 });
});

test("it keeps polling every interval while games run, then reports idle (#1352)", async () => {
  const h = harness([{ liveMatches: 2 }, { liveMatches: 1 }, { liveMatches: 0 }]);
  assert.deepEqual(await h.run(), { idle: true, polls: 3 });
  assert.deepEqual(h.calls, [0, 30_000, 60_000]);
});

test("games that never finish run out the wait without reporting idle (#1352)", async () => {
  const h = harness([{ liveMatches: 3 }], 90_000);
  const r = await h.run();
  assert.equal(r.idle, false);
  assert.deepEqual(h.calls, [0, 30_000, 60_000, 90_000]);
});

test("an unreachable server or a missing count is never treated as idle (#1352)", async () => {
  assert.equal((await harness([new Error("boom")], 60_000).run()).idle, false);
  assert.equal((await harness([{ ok: true }], 60_000).run()).idle, false);
  assert.equal((await harness([{ liveMatches: null }], 60_000).run()).idle, false);
});

test("a server that recovers after a failed check is picked up (#1352)", async () => {
  const h = harness([new Error("down"), { liveMatches: 0 }]);
  assert.deepEqual(await h.run(), { idle: true, polls: 2 });
});

test("liveMatchesOf accepts only a non-negative whole number (#1352)", () => {
  assert.equal(liveMatchesOf({ liveMatches: 0 }), 0);
  assert.equal(liveMatchesOf({ liveMatches: 4 }), 4);
  for (const bad of [undefined, null, {}, { liveMatches: -1 }, { liveMatches: "0" }, { liveMatches: 1.5 }]) assert.equal(liveMatchesOf(bad), null);
});
