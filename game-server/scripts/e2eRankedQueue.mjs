/**
 * Step 4 E2E: two clients ranked_queue → duel → concede → leaderboard ingest.
 * Run with game-server + FastAPI up (matching GAME_TOKEN_SECRET / DUEL_INGEST_SECRET).
 */
import { Client } from "@colyseus/sdk";
import { writeFileSync } from "node:fs";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const GS = process.env.GAME_SERVER_URL ?? "http://127.0.0.1:2567";
const PROTOCOL_VERSION = 1;
const lines = [];

function log(...args) {
  const s = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  lines.push(s);
  console.log(s);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mint(userKey) {
  const res = await fetch(`${API}/duel/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey }),
  });
  if (!res.ok) throw new Error(`mint ${userKey}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function leaderboard() {
  const res = await fetch(`${API}/duel/leaderboard`);
  if (!res.ok) throw new Error(`leaderboard: ${res.status}`);
  return res.json();
}

async function queueAndDuel(tokenA, tokenB) {
  const clientA = new Client(GS);
  const clientB = new Client(GS);

  const joinA = { protocolVersion: PROTOCOL_VERSION, gameToken: tokenA };
  const joinB = { protocolVersion: PROTOCOL_VERSION, gameToken: tokenB };

  const qA = await clientA.joinOrCreate("ranked_queue", joinA);
  const qB = await clientB.joinOrCreate("ranked_queue", joinB);

  const matched = await Promise.all([
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("A matched timeout")), 15000);
      qA.onMessage("queued", (m) => log("A queued", m));
      qA.onMessage("matched", (m) => {
        clearTimeout(t);
        resolve(m);
      });
      qA.onError((c, m) => reject(new Error(`A queue err ${c} ${m}`)));
    }),
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("B matched timeout")), 15000);
      qB.onMessage("queued", (m) => log("B queued", m));
      qB.onMessage("matched", (m) => {
        clearTimeout(t);
        resolve(m);
      });
      qB.onError((c, m) => reject(new Error(`B queue err ${c} ${m}`)));
    }),
  ]);

  log("matched", matched);
  if (matched[0].roomId !== matched[1].roomId) {
    throw new Error("roomId mismatch");
  }

  await qA.leave(true);
  await qB.leave(true);

  const bags = {
    A: { welcome: null, over: null, views: [] },
    B: { welcome: null, over: null, views: [] },
  };

  function wire(room, key) {
    room.onMessage("welcome", (m) => {
      bags[key].welcome = m;
      bags[key].views.push(m.view);
      log(`${key} welcome seat`, m.seat, "matchId", m.matchId);
    });
    room.onMessage("view", (m) => bags[key].views.push(m.view));
    room.onMessage("match_over", (m) => {
      bags[key].over = m;
      log(`${key} match_over`, m);
    });
    room.onMessage("error", (m) => log(`${key} error`, m));
  }

  // Join sequentially so the first seat is seated before the second triggers startMatch.
  const dA = await clientA.joinById(matched[0].roomId, {
    ...joinA,
    preferredSeat: matched[0].seat,
  });
  wire(dA, "A");
  const dB = await clientB.joinById(matched[1].roomId, {
    ...joinB,
    preferredSeat: matched[1].seat,
  });
  wire(dB, "B");

  // Welcome may race past handlers during join; always sync once.
  dA.send("sync", { protocolVersion: PROTOCOL_VERSION });
  dB.send("sync", { protocolVersion: PROTOCOL_VERSION });
  await wait(500);
  if (!bags.A.welcome || !bags.B.welcome) throw new Error("missing welcome");

  // Seat 0 concedes → seat 1 wins
  const conceder = bags.A.welcome.seat === 0 ? dA : dB;
  log("concede from seat 0");
  conceder.send("concede", { protocolVersion: PROTOCOL_VERSION });

  const start = Date.now();
  while (!bags.A.over || !bags.B.over) {
    if (Date.now() - start > 10000) throw new Error("match_over timeout");
    await wait(100);
  }

  const matchId = bags.A.welcome.matchId;
  await dA.leave(true);
  await dB.leave(true);
  return { matchId, over: bags.A.over };
}

async function main() {
  log("API", API, "GS", GS);
  const alice = await mint("e2e-alice");
  const bob = await mint("e2e-bob");
  log("alice", { user_id: alice.user_id, rating: alice.rating, games: alice.games_played });
  log("bob", { user_id: bob.user_id, rating: bob.rating, games: bob.games_played });

  const before = await leaderboard();
  log("leaderboard before", before.entries?.slice(0, 5));

  const { matchId, over } = await queueAndDuel(alice.token, bob.token);
  log("finished match", matchId, over);

  // allow ingest async
  await wait(800);
  const after = await leaderboard();
  log("leaderboard after", after.entries);

  const a = after.entries.find((e) => e.user_id === alice.user_id);
  const b = after.entries.find((e) => e.user_id === bob.user_id);
  if (!a || !b) throw new Error("players missing from leaderboard");
  if (a.games_played < 1 || b.games_played < 1) {
    throw new Error(`ingest missing games_played a=${a.games_played} b=${b.games_played}`);
  }
  // winner is seat 1 = whoever had preferredSeat 1 from matchmaker (bob was second / seat 1)
  // Matchmaker assigns first queued = seat 0. Alice queued first → seat 0 concedes → bob wins.
  log("ratings after", {
    alice: { rating: a.rating, games: a.games_played },
    bob: { rating: b.rating, games: b.games_played },
  });
  if (a.rating === 1000 && b.rating === 1000 && a.games_played === 0) {
    throw new Error("ratings did not move");
  }
  // Winner should be above loser if both started ~1000
  const winner = over.result.winner === 0 ? a : b;
  const loser = over.result.winner === 0 ? b : a;
  if (winner.rating <= loser.rating) {
    throw new Error(`expected winner rating > loser (${winner.rating} vs ${loser.rating})`);
  }

  log("PASS ranked queue → duel → leaderboard ingest");
  writeFileSync("/opt/cursor/artifacts/step4_ranked_queue_e2e.log", lines.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  lines.push(String(e?.stack || e));
  writeFileSync("/opt/cursor/artifacts/step4_ranked_queue_e2e.log", lines.join("\n") + "\n");
  process.exit(1);
});
