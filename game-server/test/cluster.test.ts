import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Client, type Room as ClientRoom } from "@colyseus/sdk";
import { Redis } from "ioredis";
import { WebSocket, WebSocketServer } from "ws";
import { createHmac } from "node:crypto";
import { RedisPresence } from "colyseus";
import { wsCompression } from "../src/cluster.js";
import { getGameTokenSecret } from "../src/env.js";
import { claimCreatorRoom, MAX_ROOMS_PER_CREATOR, releaseCreatorRoom, ROOM_COUNT_TTL_S, useSharedRoomCounts } from "../src/matchmakeGuard.js";
import { PROTOCOL_VERSION } from "../src/protocol.js";

describe("game socket compression", () => {
  it("negotiates permessage-deflate with clients that offer it (#389)", async () => {
    const wss = new WebSocketServer({ port: 0, perMessageDeflate: wsCompression({}) });
    await once(wss, "listening");
    const ws = new WebSocket(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, { perMessageDeflate: true });
    await once(ws, "open");
    assert.match(ws.extensions, /permessage-deflate/);
    ws.close();
    await new Promise((r) => wss.close(r));
  });
});

/**
 * Two real game-server processes sharing one Redis. Needs a Redis to talk to:
 * set REDIS_TEST_URL (CI runs a Redis service). Each run flushes that database.
 */
describe("game-server pool on Redis", function () {
  this.timeout(120_000);
  const redisUrl = process.env.REDIS_TEST_URL;
  const ports = [2611, 2612];
  const procs: ChildProcess[] = [];
  const rooms: ClientRoom[] = [];

  before(async function () {
    if (!redisUrl) this.skip();
    const redis = new Redis(redisUrl!);
    await redis.flushdb();
    redis.disconnect();
    for (const port of ports) {
      const proc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
        env: {
          ...process.env,
          PORT: String(port),
          REDIS_URL: redisUrl,
          PUBLIC_ADDRESS: `127.0.0.1:${port}`,
          API_BASE_URL: "http://127.0.0.1:9",
          MATCH_OUTBOX_DATABASE_URL: "",
          LOG_LEVEL: "warn",
        },
        stdio: "ignore",
      });
      procs.push(proc);
    }
    for (const port of ports) {
      const start = Date.now();
      for (;;) {
        const up = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false);
        if (up) break;
        if (Date.now() - start > 60_000) throw new Error(`game server :${port} did not start`);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  });

  after(async () => {
    await Promise.allSettled(rooms.map((r) => r.leave(true)));
    for (const proc of procs) proc.kill("SIGINT");
  });

  const join = (devUserId: string, extra: Record<string, unknown> = {}) => ({ protocolVersion: PROTOCOL_VERSION, devUserId, ...extra });
  const welcomed = (room: ClientRoom) =>
    new Promise<{ seat: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("no welcome")), 15_000);
      room.onMessage("welcome", (msg: { seat: number }) => { clearTimeout(t); resolve(msg); });
      for (const type of ["view", "events", "timer", "presence", "undo_state", "rematch_state", "chat_history", "players", "cosmetics", "skin"]) room.onMessage(type, () => {});
      room.send("sync", { protocolVersion: PROTOCOL_VERSION });
    });

  it("a game created on one process can be joined through another (#389)", async () => {
    const a = new Client(`http://127.0.0.1:${ports[0]}`);
    const b = new Client(`http://127.0.0.1:${ports[1]}`);
    const host = await a.create("duel", join("pool-host", { preferredSeat: 0, autoSkipMulligan: true }));
    rooms.push(host);
    const guest = await b.joinById(host.roomId, join("pool-guest", { preferredSeat: 1 }));
    rooms.push(guest);
    const [w0, w1] = await Promise.all([welcomed(host), welcomed(guest)]);
    assert.equal(guest.roomId, host.roomId);
    assert.deepEqual([w0.seat, w1.seat], [0, 1]);
  });

  it("players queued on different processes are paired with each other (#389)", async () => {
    const queued = (c: Client, id: string) =>
      c.joinOrCreate("ranked_queue", join(id)).then((room) => {
        rooms.push(room);
        return new Promise<string>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`${id} never matched`)), 15_000);
          room.onMessage("queued", () => {});
          room.onMessage("matched", (msg: { roomId: string }) => { clearTimeout(t); resolve(msg.roomId); });
        });
      });
    const [m0, m1] = await Promise.all([
      queued(new Client(`http://127.0.0.1:${ports[0]}`), "pool-q0"),
      queued(new Client(`http://127.0.0.1:${ports[1]}`), "pool-q1"),
    ]);
    assert.equal(m0, m1);
  });
});

describe("per-account open-room cap across a pool", function () {
  this.timeout(30_000);
  const redisUrl = process.env.REDIS_TEST_URL;
  const stores: RedisPresence[] = [];

  before(async function () {
    if (!redisUrl) this.skip();
    const redis = new Redis(redisUrl!);
    await redis.flushdb();
    redis.disconnect();
  });

  beforeEach(async () => {
    const redis = new Redis(redisUrl!);
    await redis.flushdb();
    redis.disconnect();
  });
  afterEach(() => useSharedRoomCounts(null));
  after(() => stores.forEach((s) => s.shutdown()));

  const deployed = () => {
    process.env.REQUIRE_GAME_TOKEN = "true";
    const b64url = (buf: Buffer) => buf.toString("base64url");
    const body = b64url(Buffer.from(JSON.stringify({ uid: 682, email: "cap@example.com", exp: Math.floor(Date.now() / 1000) + 600 })));
    return { gameToken: `${body}.${b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest())}` };
  };

  it("counts an account's open rooms across processes, not per process (#682)", async () => {
    const options = deployed();
    try {
      // Two processes are two stores on the same Redis; each starts with a count of zero of its own.
      const a = new RedisPresence(redisUrl!);
      const b = new RedisPresence(redisUrl!);
      stores.push(a, b);
      useSharedRoomCounts(a);
      for (let i = 0; i < MAX_ROOMS_PER_CREATOR; i++) await claimCreatorRoom(options);
      useSharedRoomCounts(b);
      await assert.rejects(() => claimCreatorRoom(options), /Too many open rooms/);
      // Releasing on the first process frees a slot for the second.
      useSharedRoomCounts(a);
      releaseCreatorRoom(682);
      await new Promise((r) => setTimeout(r, 100));
      useSharedRoomCounts(b);
      assert.equal(await claimCreatorRoom(options), 682);
    } finally {
      delete process.env.REQUIRE_GAME_TOKEN;
    }
  });

  it("a crashed process's count expires instead of pinning the cap (#682)", async () => {
    const options = deployed();
    try {
      const a = new RedisPresence(redisUrl!);
      stores.push(a);
      useSharedRoomCounts(a);
      await claimCreatorRoom(options);
      const redis = new Redis(redisUrl!);
      const ttl = await redis.ttl("duel:rooms:682");
      redis.disconnect();
      assert.ok(ttl > 0 && ttl <= ROOM_COUNT_TTL_S, `ttl ${ttl}`);
    } finally {
      delete process.env.REQUIRE_GAME_TOKEN;
    }
  });
});
