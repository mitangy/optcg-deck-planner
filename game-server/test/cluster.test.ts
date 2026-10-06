import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Client, type Room as ClientRoom } from "@colyseus/sdk";
import { Redis } from "ioredis";
import { WebSocket, WebSocketServer } from "ws";
import { wsCompression } from "../src/cluster.js";
import { PROTOCOL_VERSION } from "../src/protocol.js";

describe("game socket compression", () => {
  it("negotiates permessage-deflate with clients that offer it (#scale)", async () => {
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

  it("a game created on one process can be joined through another (#scale)", async () => {
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

  it("players queued on different processes are paired with each other (#scale)", async () => {
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
