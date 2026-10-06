/**
 * Capacity probe: keep MATCHES concurrent duels running with bot players that
 * pick random legal intents after THINK_MS. Finished games are replaced so the
 * count stays steady. Prints one JSON line with intents and errors per sample.
 * Server-side CPU / RSS are sampled by the caller from /proc.
 *
 * Never point this at production. Run a local server (cap it with a cgroup to
 * mimic a plan's CPU), then:
 *   DECKS=decks.json MATCHES=400 THINK_MS=5000 node scripts/loadMatches.mjs
 * DECKS is a JSON array of { leaderId, deck } player decks (the join `deck` shape). GS_URL may list
 * several comma-separated servers of one pool: each game is created on the
 * next one and its second player joins through another, which exercises the
 * Redis driver and PUBLIC_ADDRESS routing (docs/scaling.md).
 */
import { Client } from "@colyseus/sdk";
import { readFileSync } from "node:fs";

const GS_URLS = (process.env.GS_URL ?? "http://127.0.0.1:2567").split(",").map((u) => u.trim()).filter(Boolean);
const MATCHES = Number(process.env.MATCHES ?? 10);
const THINK_MS = Number(process.env.THINK_MS ?? 1000);
const DURATION_MS = Number(process.env.DURATION_MS ?? 60000);
const SEAT_SECONDS = Number(process.env.SEAT_SECONDS ?? 900);
const PV = 5;
const SKIN_CHARS = Number(process.env.SKIN_CHARS ?? 0);
const skinMsg = SKIN_CHARS ? { protocolVersion: 5, skin: { playmat: "data:image/webp;base64," + "A".repeat(SKIN_CHARS - 23), cardBack: null } } : null;
const decks = JSON.parse(readFileSync(process.env.DECKS, "utf8"));

const stats = { intents: 0, errors: 0, games: 0, joinFail: 0, illegal: 0, latSum: 0, latN: 0, latMax: 0 };
let stopping = false;
let uid = 0;

function pick(legal, rnd = Math.random) {
  const end = legal.find((i) => i.type === "end_turn");
  if (end && rnd() < 0.25) return end;
  return legal[Math.floor(rnd() * legal.length)];
}

function bot(room, onOver) {
  let timer = null;
  let sentAt = 0;
  room.onMessage("view", (msg) => {
    if (sentAt) {
      const l = Date.now() - sentAt;
      stats.latSum += l; stats.latN += 1; stats.latMax = Math.max(stats.latMax, l);
      sentAt = 0;
    }
    const legal = msg?.view?.legalIntents ?? [];
    if (timer) { clearTimeout(timer); timer = null; }
    if (!legal.length || msg.view.winner !== null || stopping) return;
    const jitter = THINK_MS * (0.5 + Math.random());
    timer = setTimeout(() => {
      timer = null;
      try { sentAt = Date.now(); room.send("intent", { protocolVersion: PV, intent: pick(legal) }); stats.intents += 1; } catch { stats.errors += 1; }
    }, jitter);
  });
  room.onMessage("error", (m) => { if (m?.code === "illegal_intent") stats.illegal += 1; else stats.errors += 1; });
  room.onMessage("match_over", () => { if (timer) clearTimeout(timer); onOver(); });
  for (const t of ["events", "timer", "presence", "welcome", "undo_state", "rematch_state", "chat_history", "cosmetics", "skin", "pong"]) room.onMessage(t, () => {});
}

async function runMatch(slot) {
  if (stopping) return;
  const client = new Client(GS_URLS[slot % GS_URLS.length]);
  const other = new Client(GS_URLS[(slot + 1) % GS_URLS.length]);
  const a = decks[Math.floor(Math.random() * decks.length)];
  const b = decks[Math.floor(Math.random() * decks.length)];
  try {
    const id = uid++;
    const ra = await client.create("duel", {
      protocolVersion: PV, devUserId: `load-a-${id}`, preferredSeat: 0, autoSkipMulligan: true,
      players: [a, b], timer: { seatSeconds: SEAT_SECONDS },
    });
    let done = false;
    const over = async () => {
      if (done) return; done = true; stats.games += 1;
      await Promise.allSettled([ra.leave(true), rb.leave(true)]);
      runMatch(slot);
    };
    bot(ra, over);
    const rb = await other.joinById(ra.roomId, { protocolVersion: PV, devUserId: `load-b-${id}`, preferredSeat: 1 });
    bot(rb, over);
    if (skinMsg) { ra.send("skin", skinMsg); rb.send("skin", skinMsg); }
    ra.send("sync", { protocolVersion: PV });
    rb.send("sync", { protocolVersion: PV });
  } catch (e) {
    stats.joinFail += 1;
    if (stats.joinFail < 5) console.error("join failed", e?.message ?? e);
    setTimeout(() => runMatch(slot), 2000);
  }
}

for (let i = 0; i < MATCHES; i++) { runMatch(i); await new Promise((r) => setTimeout(r, 30)); }
const t0 = Date.now();
const iv = setInterval(() => {
  const lat = stats.latN ? Math.round(stats.latSum / stats.latN) : null;
  console.log(JSON.stringify({ t: Math.round((Date.now() - t0) / 1000), ...stats, latAvg: lat }));
  stats.latSum = 0; stats.latN = 0; stats.latMax = 0;
}, 5000);
setTimeout(() => { stopping = true; clearInterval(iv); setTimeout(() => process.exit(0), 1000); }, DURATION_MS);
