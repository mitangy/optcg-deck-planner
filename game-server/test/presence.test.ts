import assert from "node:assert/strict";
import { PresenceReporter } from "../src/presence.js";

async function waitUntil(pred: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("PresenceReporter", () => {
  it("pushes a full snapshot of real accounts to the API with the ingest secret", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const reporter = new PresenceReporter(send, "gs-test");
    reporter.register({
      presenceEntries: () => [
        { user_id: 5, room_id: "r1", role: "player", phase: "playing", ranked: true },
        // Legacy devUserId seats carry synthetic negative ids; no account to show.
        { user_id: -77, room_id: "r1", role: "player", phase: "playing", ranked: true },
      ],
    });

    await reporter.flush();
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/duel\/presence$/);
    assert.equal(calls[0]!.init.method, "PUT");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["X-Duel-Ingest-Token"], "dev-duel-ingest");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
      instance_id: "gs-test",
      entries: [{ user_id: 5, room_id: "r1", role: "player", phase: "playing", ranked: true }],
    });
  });

  it("pushes soon after a change once started, and not before", async () => {
    let count = 0;
    const send = (async () => {
      count += 1;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const reporter = new PresenceReporter(send, "gs-test", 10, 60_000);
    reporter.markDirty();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(count, 0);

    reporter.start(); // immediate snapshot
    await waitUntil(() => count === 1);
    reporter.markDirty();
    await waitUntil(() => count === 2, 1000);
    reporter.stop();
  });
});
