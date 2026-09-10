/**
 * Step 5 load smoke: create a duel, join second player, attach many spectators.
 * Usage: node game-server/scripts/loadSpectators.mjs
 *
 * Colyseus may deliver `welcome` before onMessage is registered, so we always
 * follow up with `sync` (same pattern as duelRoom spectator tests).
 */
import { Client } from "@colyseus/sdk";

const GS_URL = process.env.GS_URL ?? "http://127.0.0.1:2567";
const SPECTATORS = Number(process.env.SPECTATORS ?? 8);
const HOLD_MS = Number(process.env.HOLD_MS ?? 5000);
const PROTOCOL_VERSION = 1;

function join(devUserId, extra = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    devUserId,
    ...extra,
  };
}

function waitWelcome(room, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("welcome timeout")), timeoutMs);
    const done = (msg) => {
      clearTimeout(t);
      resolve(msg);
    };
    room.onMessage("welcome", done);
    room.onError((code, message) => {
      clearTimeout(t);
      reject(new Error(message || `error ${code}`));
    });
    // Re-request welcome if the first one was missed.
    try {
      room.send("sync", { protocolVersion: PROTOCOL_VERSION });
    } catch (e) {
      clearTimeout(t);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

const client = new Client(GS_URL);
const started = Date.now();

const roomA = await client.joinOrCreate("duel", {
  ...join("load-a", { preferredSeat: 0 }),
  autoSkipMulligan: true,
  protocolVersion: PROTOCOL_VERSION,
});
const roomId = roomA.roomId;
console.log(JSON.stringify({ event: "created", roomId }));

const roomB = await client.joinById(roomId, join("load-b", { preferredSeat: 1 }));
await Promise.all([waitWelcome(roomA), waitWelcome(roomB)]);
console.log(JSON.stringify({ event: "players_ready", roomId }));

const specs = [];
let ok = 0;
let fail = 0;
for (let i = 0; i < SPECTATORS; i++) {
  try {
    const r = await client.joinById(
      roomId,
      join(`spec-${i}`, { role: "spectator", preferredSeat: 0 }),
    );
    const welcome = await waitWelcome(r);
    const view = welcome.view;
    if (welcome.role !== "spectator") throw new Error("missing spectator role");
    if (view.you?.hand?.length) throw new Error("spectator saw hand");
    specs.push(r);
    ok += 1;
  } catch (e) {
    fail += 1;
    console.log(
      JSON.stringify({
        event: "spectator_fail",
        i,
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

console.log(
  JSON.stringify({
    event: "summary",
    roomId,
    spectatorsOk: ok,
    spectatorsFail: fail,
    elapsedMs: Date.now() - started,
  }),
);

await new Promise((r) => setTimeout(r, HOLD_MS));
await Promise.allSettled([
  roomA.leave(true),
  roomB.leave(true),
  ...specs.map((r) => r.leave(true)),
]);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
