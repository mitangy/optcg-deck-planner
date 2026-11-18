import assert from "node:assert/strict";
import { Room, type Client } from "colyseus";
import { rejectPendingReconnections } from "../src/rooms/pendingReconnections.js";

class ProbeRoom extends Room {}

// A dropped client as Colyseus hands it to allowReconnection(): only these fields are read.
const droppedClient = (sessionId: string, reconnectionToken: string) =>
  ({ sessionId, reconnectionToken, auth: {} }) as unknown as Client;

describe("Colyseus _reconnections (seat takeover relies on it)", () => {
  it("is a record of [sessionId, deferred] entries on the installed Colyseus version (#1353)", () => {
    const room = new ProbeRoom();
    const raw = (room as unknown as { _reconnections: unknown })._reconnections;
    assert.equal(typeof raw, "object");
    assert.notEqual(raw, null);
    assert.equal(Array.isArray(raw), false);
    assert.deepEqual(Object.keys(raw as object), []);

    const deferred = room.allowReconnection(droppedClient("s1", "tok1"), "manual");
    deferred.catch(() => undefined);
    const entries = Object.entries((room as unknown as { _reconnections: Record<string, unknown[]> })._reconnections);
    assert.equal(entries.length, 1);
    const [token, entry] = entries[0]!;
    assert.equal(token, "tok1");
    assert.equal(entry![0], "s1");
    assert.equal(typeof (entry![1] as { reject: unknown }).reject, "function");
  });

  it("rejects only the reclaims pending for the given session (#1353)", async () => {
    const room = new ProbeRoom();
    const taken = room.allowReconnection(droppedClient("old", "tok-old"), "manual");
    const other = room.allowReconnection(droppedClient("keep", "tok-keep"), "manual");
    const outcomes: string[] = [];
    taken.then(() => outcomes.push("old resolved"), () => outcomes.push("old rejected"));
    other.then(() => outcomes.push("keep resolved"), () => outcomes.push("keep rejected"));
    rejectPendingReconnections(room, "old");
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(outcomes, ["old rejected"]);
    other.reject(false);
  });

  it("throws instead of skipping when the private field changes shape (#1353)", () => {
    assert.throws(() => rejectPendingReconnections({}, "s"), /_reconnections is not a record/);
    assert.throws(() => rejectPendingReconnections({ _reconnections: { t: ["s", {}] } }, "s"), /not \[sessionId, deferred\]/);
  });
});
