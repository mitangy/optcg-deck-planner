import assert from "node:assert/strict";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { createHmac } from "node:crypto";
import { matchMaker } from "colyseus";
import { installCorsAllowlist } from "../src/cors.js";
import { getGameTokenSecret, getRankedMatchCreateSecret } from "../src/env.js";
import { PROTOCOL_VERSION, TAKEN_OVER_CLOSE_CODE } from "../src/protocol.js";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";

type View = { seat: 0 | 1; phase: string; winner: 0 | 1 | null; legalIntents: { type: string }[] };
type Bag = {
  welcomes: View[];
  views: View[];
  errors: { code: string; message: string }[];
  over?: { result: { winner: 0 | 1; reason: string } };
  takenOver: { seat: number }[];
  closeCode?: number;
};

function gameToken(uid: number): string {
  const b64url = (buf: Buffer) =>
    buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const body = b64url(
    Buffer.from(JSON.stringify({ uid, email: `u${uid}@x.com`, exp: Math.floor(Date.now() / 1000) + 600 })),
  );
  return `${body}.${b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest())}`;
}

function attach(client: ClientRoom): Bag {
  const bag: Bag = { welcomes: [], views: [], errors: [], takenOver: [] };
  client.onMessage("welcome", (m: { view: View }) => {
    bag.welcomes.push(m.view);
    bag.views.push(m.view);
  });
  client.onMessage("view", (m: { view: View }) => bag.views.push(m.view));
  client.onMessage("error", (m: { code: string; message: string }) => bag.errors.push(m));
  client.onMessage("match_over", (m: { result: { winner: 0 | 1; reason: string } }) => {
    bag.over = m;
  });
  client.onMessage("taken_over", (m: { seat: number }) => bag.takenOver.push(m));
  client.onLeave((code) => {
    bag.closeCode = code;
  });
  // The SDK would otherwise try to reconnect a socket the server closed on purpose.
  client.reconnection.enabled = false;
  return bag;
}

async function waitUntil(pred: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Joins and reports whether the room turned it away, and with which code. The error
 * message itself is sent before the client can register a handler, so the room's
 * rejectJoin is observed instead.
 */
async function joinRefused(
  colyseus: ColyseusTestServer,
  room: DuelRoom,
  options: Record<string, unknown>,
): Promise<{ refused: boolean; code?: string; message?: string }> {
  const target = room as unknown as { rejectJoin(c: unknown, code: string, message: string): void };
  const original = target.rejectJoin;
  const seen: { code: string; message: string }[] = [];
  target.rejectJoin = function (this: unknown, c: unknown, code: string, message: string) {
    seen.push({ code, message });
    return original.call(this, c, code, message);
  };
  try {
    const c = await colyseus.connectTo(room, options);
    const bag = attach(c);
    await sleep(300);
    return { refused: seen.length > 0 && bag.welcomes.length === 0, code: seen[0]?.code, message: seen[0]?.message };
  } catch {
    return { refused: seen.length > 0, code: seen[0]?.code, message: seen[0]?.message };
  } finally {
    target.rejectJoin = original;
  }
}

/** Messages sent during the join handshake predate onMessage handlers, so ask for the welcome again. */
async function syncAll(...pairs: [ClientRoom, Bag][]) {
  for (const [c] of pairs) c.send("sync", { protocolVersion: PROTOCOL_VERSION });
  await waitUntil(() => pairs.every(([, b]) => b.welcomes.length > 0));
}

const opts = (uid: number, seat: 0 | 1, extra: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  gameToken: gameToken(uid),
  preferredSeat: seat,
  ...extra,
});

/**
 * Registered inside duelRoom.test.ts's describe: one process can boot only one
 * Colyseus test server, so these share its server and its per-test cleanup.
 */
export function deviceHandoffTests(getServer: () => ColyseusTestServer): void {
  const colyseus = new Proxy({} as ColyseusTestServer, {
    get: (_t, prop) => (getServer() as never as Record<string | symbol, unknown>)[prop],
  });
  describe("device handoff (#451)", () => {
  async function startedPair(extraCreate: Record<string, unknown> = {}, uids: [number, number] = [101, 102]) {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 5,
      autoSkipMulligan: true,
      ...extraCreate,
    });
    const c0 = await colyseus.connectTo(room, opts(uids[0], 0));
    const b0 = attach(c0);
    const c1 = await colyseus.connectTo(room, opts(uids[1], 1));
    const b1 = attach(c1);
    await syncAll([c0, b0], [c1, b1]);
    return { room, c0, b0, c1, b1 };
  }

  async function sendLegalIntent(client: ClientRoom, bag: Bag) {
    const seen = bag.views.length;
    const legal = bag.views.at(-1)!.legalIntents;
    client.send("intent", { protocolVersion: PROTOCOL_VERSION, intent: legal[0] });
    await waitUntil(() => bag.views.length > seen || bag.errors.length > 0);
  }

  it("taking a seat over closes the old connected device and hands the seat to the new one without a forfeit (#451)", async () => {
    const { room, c0, b0, b1 } = await startedPair();
    const welcomedTo: string[] = [];
    const sendSync = (room as unknown as { sendSync(c: { sessionId: string }): void }).sendSync;
    (room as unknown as { sendSync: unknown }).sendSync = function (this: unknown, c: { sessionId: string }) {
      welcomedTo.push(c.sessionId);
      return sendSync.call(this, c);
    };
    const c0b = await colyseus.connectTo(room, opts(101, 0, { takeover: true }));
    const nb = attach(c0b);
    // The takeover itself sends the seat's welcome to the new device (see syncAll for why we ask again).
    assert.ok(welcomedTo.includes(c0b.sessionId), "new device is welcomed on join");
    await syncAll([c0b, nb]);
    await waitUntil(() => b0.closeCode !== undefined);
    assert.equal(nb.welcomes[0]!.seat, 0);
    assert.equal(b0.takenOver.length, 1);
    assert.equal(b0.takenOver[0]!.seat, 0);
    assert.equal(b0.closeCode, TAKEN_OVER_CLOSE_CODE);

    // The new device plays; the old one is no longer the seat's connection.
    await sendLegalIntent(c0b, nb);
    assert.equal(nb.errors.length, 0);
    const oldSeen = b0.views.length;
    c0.send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await sleep(2000); // past the 1.5s forfeit delay of a real leave
    assert.equal(b0.views.length, oldSeen);
    assert.equal(b1.over, undefined, "opponent must not be handed a forfeit win");
  });

  it("taking over a dropped seat during the reconnect grace works and the old reconnection token can no longer reclaim (#451)", async () => {
    const prev = process.env.RECONNECT_GRACE_SECONDS;
    process.env.RECONNECT_GRACE_SECONDS = "1";
    try {
      const { room, c0, b0, c1, b1 } = await startedPair();
      const oldToken = c0.reconnectionToken;
      // Abnormal drop (no close handshake): the seat is held for reconnection.
      const serverSide = room.clients.find((c) => c.sessionId === c0.sessionId)!;
      (serverSide.ref as unknown as { terminate(): void }).terminate();
      await waitUntil(() => b0.closeCode !== undefined);
      await sleep(100);

      const n = await colyseus.connectTo(room, opts(101, 0, { takeover: true }));
      const nb = attach(n);
      await syncAll([n, nb]);

      // The old token is dead.
      let reclaimed = false;
      try {
        const r = await colyseus.sdk.reconnect(oldToken);
        reclaimed = true;
        await r.leave();
      } catch {
        /* expected */
      }
      assert.equal(reclaimed, false);

      // Outlast the grace window: the new device keeps the seat and nobody forfeits.
      await sleep(2500);
      assert.equal(b1.over, undefined);
      assert.equal(nb.over, undefined);
      await sendLegalIntent(n, nb);
      assert.equal(nb.errors.length, 0);
      await c1.leave(true);
    } finally {
      if (prev === undefined) delete process.env.RECONNECT_GRACE_SECONDS;
      else process.env.RECONNECT_GRACE_SECONDS = prev;
    }
  });

  it("another account cannot take over a seat it does not hold (#451)", async () => {
    const { room, b0, b1, c0 } = await startedPair();
    const r = await joinRefused(colyseus, room, opts(999, 0, { takeover: true }));
    assert.equal(r.refused, true);
    assert.equal(r.code, "unauthorized");
    // Seat 1's owner can't claim seat 0 either.
    const r2 = await joinRefused(colyseus, room, opts(102, 0, { takeover: true }));
    assert.equal(r2.code, "unauthorized");
    await sleep(200);
    assert.equal(b0.takenOver.length, 0);
    assert.equal(b0.closeCode, undefined);
    assert.equal(b1.over, undefined);
    await sendLegalIntent(c0, b0);
    assert.equal(b0.errors.length, 0);
  });

  it("a practice owner takes over both guest seats with ownerToken; others cannot (#451)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 6,
      autoSkipMulligan: true,
    });
    const owner = gameToken(300);
    const g0 = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION, devUserId: "hotseat-a", preferredSeat: 0, ownerToken: owner,
    });
    const gb0 = attach(g0);
    const g1 = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION, devUserId: "hotseat-b", preferredSeat: 1, ownerToken: owner,
    });
    const gb1 = attach(g1);
    await syncAll([g0, gb0], [g1, gb1]);

    // Another signed-in account can't.
    assert.equal((await joinRefused(colyseus, room, opts(301, 0, { takeover: true }))).code, "unauthorized");
    // A guest-id seat isn't owned by whoever merely knows the room id, and a bad ownerToken is ignored.
    assert.equal(
      (await joinRefused(colyseus, room, opts(301, 1, { takeover: true, ownerToken: "not.valid" }))).code,
      "unauthorized",
    );

    const nc0 = await colyseus.connectTo(room, opts(300, 0, { takeover: true }));
    const n0 = attach(nc0);
    const nc1 = await colyseus.connectTo(room, opts(300, 1, { takeover: true }));
    const n1 = attach(nc1);
    await syncAll([nc0, n0], [nc1, n1]);
    assert.equal(n0.welcomes[0]!.seat, 0);
    assert.equal(n1.welcomes[0]!.seat, 1);
    assert.equal(gb0.closeCode, TAKEN_OVER_CLOSE_CODE);
    assert.equal(gb1.closeCode, TAKEN_OVER_CLOSE_CODE);
  });

  it("a guest seat without ownerToken cannot be taken over by an account (#451)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", { protocolVersion: PROTOCOL_VERSION, seed: 7 });
    const g0 = await colyseus.connectTo(room, { protocolVersion: PROTOCOL_VERSION, devUserId: "plain-a", preferredSeat: 0 });
    const gb0 = attach(g0);
    const g1 = await colyseus.connectTo(room, { protocolVersion: PROTOCOL_VERSION, devUserId: "plain-b", preferredSeat: 1 });
    attach(g1);
    await syncAll([g0, gb0]);
    const r = await joinRefused(colyseus, room, opts(300, 0, { takeover: true }));
    assert.equal(r.code, "unauthorized");
    assert.equal(gb0.takenOver.length, 0);
  });

  it("a ranked reserved seat can only be taken over by its own account on its own seat (#451)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      ranked: true,
      rankedAttestation: getRankedMatchCreateSecret(),
      seatUserIds: [41, 42],
    });
    const c0 = await colyseus.connectTo(room, opts(41, 0));
    const b0 = attach(c0);
    const c1 = await colyseus.connectTo(room, opts(42, 1));
    attach(c1);
    await syncAll([c0, b0]);

    assert.equal((await joinRefused(colyseus, room, opts(43, 0, { takeover: true }))).code, "unauthorized");
    // Account 42 is reserved for seat 1, so it can't name seat 0.
    assert.equal((await joinRefused(colyseus, room, opts(42, 0, { takeover: true }))).code, "unauthorized");
    assert.equal(b0.takenOver.length, 0);

    const nc = await colyseus.connectTo(room, opts(41, 0, { takeover: true }));
    const n = attach(nc);
    await syncAll([nc, n]);
    await waitUntil(() => b0.closeCode !== undefined);
    assert.equal(n.welcomes[0]!.seat, 0);
  });

  it("takeover is refused once the match is over (#451)", async () => {
    const { room, c0, b0, b1 } = await startedPair();
    c0.send("concede", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => b0.over !== undefined && b1.over !== undefined);
    const r = await joinRefused(colyseus, room, opts(101, 0, { takeover: true }));
    assert.equal(r.refused, true);
    assert.equal(r.code, "match_over");
    assert.equal(b0.takenOver.length, 0);
  });

  describe("GET /active-matches", () => {
    const get = (headers: Record<string, string> = {}, query = "") =>
      colyseus.http.get(`/active-matches${query}`, { headers }).then(
        (r: { statusCode: number; data: unknown }) => ({ status: r.statusCode, data: r.data as { matches: Record<string, unknown>[] } }),
        (e: { statusCode: number }) => ({ status: e.statusCode, data: { matches: [] } }),
      );
    const bearer = (uid: number) => ({ Authorization: `Bearer ${gameToken(uid)}` });

    it("lists a live match for the account that holds a seat, not for anyone else (#451)", async () => {
      const { room } = await startedPair({}, [111, 112]);
      await waitUntil(() => (room.metadata as { phase?: string } | undefined)?.phase === "playing");
      const mine = await get(bearer(111));
      assert.equal(mine.status, 200);
      assert.equal(mine.data.matches.length, 1);
      assert.deepEqual(mine.data.matches[0], {
        roomId: room.roomId, seats: [0], practice: false, ranked: false, phase: "playing",
      });
      const other = await get(bearer(555));
      assert.deepEqual(other.data.matches, []);
      assert.equal((await get()).status, 401);
      assert.equal((await get({ Authorization: "Bearer junk" })).status, 401);
    });

    it("reports a practice match with both seats for its ownerToken account (#451)", async () => {
      const room = await colyseus.createRoom<DuelRoom>("duel", { protocolVersion: PROTOCOL_VERSION });
      const owner = gameToken(222);
      for (const [i, id] of ["pa", "pb"].entries()) {
        attach(await colyseus.connectTo(room, {
          protocolVersion: PROTOCOL_VERSION, devUserId: id, preferredSeat: i, ownerToken: owner,
        }));
      }
      await waitUntil(() => (room.metadata as { phase?: string } | undefined)?.phase === "playing");
      const res = await get(bearer(222));
      assert.deepEqual(res.data.matches  .map((m: Record<string, unknown>) => [m.seats, m.practice]), [[[0, 1], true]]);
    });

    it("leaves out finished matches (#451)", async () => {
      const { room, c0, b0, b1 } = await startedPair({}, [131, 132]);
      assert.equal((await get(bearer(131))).data.matches.length, 1);
      c0.send("concede", { protocolVersion: PROTOCOL_VERSION });
      await waitUntil(() => b0.over !== undefined && b1.over !== undefined);
      await waitUntil(() => (room.metadata as { phase?: string } | undefined)?.phase === "finished");
      assert.deepEqual((await get(bearer(131))).data.matches, []);
    });

    it("accepts ?devUserId= only while game tokens are not required (#451)", async () => {
      const { room } = await startedPair({}, [141, 142]);
      await waitUntil(() => (room.metadata as { phase?: string } | undefined)?.phase === "playing");
      // startedPair seated real accounts; a dev user holds no seat, but is still a valid caller.
      assert.deepEqual((await get({}, "?devUserId=nobody")).data.matches, []);
      assert.equal((await get({}, "?devUserId=nobody")).status, 200);
      const prev = process.env.REQUIRE_GAME_TOKEN;
      process.env.REQUIRE_GAME_TOKEN = "true";
      try {
        assert.equal((await get({}, "?devUserId=nobody")).status, 401);
      } finally {
        if (prev === undefined) delete process.env.REQUIRE_GAME_TOKEN;
        else process.env.REQUIRE_GAME_TOKEN = prev;
      }
    });

    it("answers the CORS preflight and tags responses for an allowlisted origin only (#451)", async () => {
      const previous = matchMaker.controller.getCorsHeaders.bind(matchMaker.controller);
      installCorsAllowlist(); // as src/index.ts does at startup
      try {
        const base = `http://localhost:${(colyseus.server as unknown as { port: number }).port}`;
        const origin = "http://localhost:5174";
        const pre = await fetch(`${base}/active-matches`, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Headers": "authorization" },
        });
        assert.equal(pre.status, 204);
        assert.equal(pre.headers.get("access-control-allow-origin"), origin);
        assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Authorization/i);
        const res = await fetch(`${base}/active-matches`, { headers: { Origin: origin, ...bearer(1) } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("access-control-allow-origin"), origin);
        const evil = await fetch(`${base}/active-matches`, { headers: { Origin: "https://evil.example", ...bearer(1) } });
        assert.equal(evil.headers.get("access-control-allow-origin"), "null");
      } finally {
        matchMaker.controller.getCorsHeaders = previous;
      }
    });
  });
  });
}
