import assert from "node:assert/strict";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import appConfig from "../src/app.config.js";
import { presence, type PresenceEntry } from "../src/presence.js";
import {
  PROTOCOL_VERSION,
  SKIN_MAX_CARD_BACK_CHARS,
  SKIN_MAX_PLAYMAT_CHARS,
} from "../src/protocol.js";
import { getGameTokenSecret } from "../src/env.js";
import { createHmac } from "node:crypto";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";

type PlayerView = {
  seat: 0 | 1;
  you: { hand: { id: string; defId: string }[]; lifeCount: number; mulliganDone: boolean };
  opponent: { handCount: number };
  legalIntents: (Record<string, unknown> & { type: string })[];
  winner: 0 | 1 | null;
  phase: string;
  activeSeat: 0 | 1;
};

type SeatBag = {
  welcome?: PlayerView;
  players?: { name: string | null }[];
  views: PlayerView[];
  errors: { code: string; message: string }[];
  over?: { result: { winner: 0 | 1; reason: string } };
};

function joinOpts(devUserId: string, preferredSeat?: 0 | 1) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    devUserId,
    preferredSeat,
  };
}

function attach(client: ClientRoom, bag: SeatBag) {
  client.onMessage(
    "welcome",
    (msg: { seat: 0 | 1; view: PlayerView; players?: { name: string | null }[] }) => {
      bag.welcome = msg.view;
      bag.players = msg.players;
      bag.views.push(msg.view);
    },
  );
  client.onMessage("view", (msg: { view: PlayerView }) => {
    bag.views.push(msg.view);
  });
  client.onMessage("error", (msg: { code: string; message: string }) => {
    bag.errors.push(msg);
  });
  client.onMessage(
    "match_over",
    (msg: { result: { winner: 0 | 1; reason: string } }) => {
      bag.over = msg;
    },
  );
}

async function waitUntil(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function syncSeat(client: ClientRoom, bag: SeatBag) {
  client.send("sync", { protocolVersion: PROTOCOL_VERSION });
  await waitUntil(() => bag.welcome != null && bag.views.length > 0, 8000);
}

/** Signed game token for a real account id (mirror of backend mint_game_token). */
function gameToken(uid: number): string {
  const b64url = (buf: Buffer) =>
    buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const body = b64url(
    Buffer.from(JSON.stringify({ uid, email: `u${uid}@x.com`, exp: Math.floor(Date.now() / 1000) + 600 })),
  );
  return `${body}.${b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest())}`;
}

function presenceFor(roomId: string): PresenceEntry[] {
  return presence
    .snapshot()
    .filter((e) => e.room_id === roomId)
    .sort((a, b) => a.user_id - b.user_id);
}

describe("DuelRoom", () => {
  let colyseus: ColyseusTestServer;

  before(async () => {
    colyseus = await boot(appConfig);
  });

  after(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("two clients get private views; opponent hand is hidden", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: true,
    });

    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];

    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);

    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    assert.equal(bags[0].welcome!.seat, 0);
    assert.equal(bags[1].welcome!.seat, 1);
    assert.equal(bags[0].welcome!.you.hand.length, 5);
    assert.equal(bags[1].welcome!.you.hand.length, 5);
    assert.equal(bags[0].welcome!.opponent.handCount, 5);
    assert.equal(bags[1].welcome!.opponent.handCount, 5);
    assert.equal("hand" in bags[0].welcome!.opponent, false);
    assert.equal("hand" in bags[1].welcome!.opponent, false);

    // Both seats see seat-indexed public names (dev ids here; usernames via tokens).
    assert.deepEqual(bags[0].players, [{ name: "alice" }, { name: "bob" }]);
    assert.deepEqual(bags[1].players, [{ name: "alice" }, { name: "bob" }]);

    const ids0 = bags[0].welcome!.you.hand.map((c) => c.id);
    const ids1 = bags[1].welcome!.you.hand.map((c) => c.id);
    const dump0 = JSON.stringify(bags[0].welcome);
    const dump1 = JSON.stringify(bags[1].welcome);
    for (const id of ids1) assert.equal(dump0.includes(id), false);
    for (const id of ids0) assert.equal(dump1.includes(id), false);
  });

  it("mulligan phase keeps both seats until Keep/Mulligan intents resolve", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 99,
      autoSkipMulligan: false,
    });

    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];

    const c0 = await colyseus.connectTo(room, joinOpts("m0", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("m1", 1));
    attach(c1, bags[1]);

    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    assert.equal(bags[0].welcome!.phase, "mulligan");
    assert.equal(bags[0].welcome!.you.lifeCount, 0);
    assert.equal(bags[0].welcome!.you.hand.length, 5);
    assert.ok(
      bags[0].welcome!.legalIntents.some(
        (i) => i.type === "mulligan" && i.doMulligan === true,
      ),
    );

    c0.send("intent", {
      protocolVersion: PROTOCOL_VERSION,
      intent: { type: "mulligan", doMulligan: true },
    });
    await waitUntil(() => bags[0].views.some((v) => v.you.mulliganDone), 5000);
    assert.equal(bags[0].views.at(-1)!.phase, "mulligan");

    c1.send("intent", {
      protocolVersion: PROTOCOL_VERSION,
      intent: { type: "mulligan", doMulligan: false },
    });
    await waitUntil(() => bags[0].views.some((v) => v.phase === "main"), 5000);
    const main = bags[0].views.at(-1)!;
    assert.equal(main.phase, "main");
    assert.equal(main.you.lifeCount, 5);
    assert.equal(main.you.hand.length, 5);
  });

  it("illegal intent errors without advancing; legal play reaches match_over", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });

    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];

    const c0 = await colyseus.connectTo(room, joinOpts("p0", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("p1", 1));
    attach(c1, bags[1]);

    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    const beforePhase = bags[0].views.at(-1)!.phase;
    const inactive: 0 | 1 = bags[0].views.at(-1)!.activeSeat === 0 ? 1 : 0;
    const inactiveClient = inactive === 0 ? c0 : c1;
    inactiveClient.send("intent", {
      protocolVersion: PROTOCOL_VERSION,
      intent: { type: "end_turn" },
    });
    await waitUntil(() => bags[inactive].errors.length > 0, 5000);
    assert.equal(bags[inactive].errors[0]!.code, "illegal_intent");
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(bags[0].views.at(-1)!.phase, beforePhase);

    let guard = 0;
    while (bags[0].over == null && bags[1].over == null && guard < 600) {
      guard += 1;
      const latest0 = bags[0].views.at(-1)!;
      const latest1 = bags[1].views.at(-1)!;
      if (latest0.winner != null || latest1.winner != null) break;
      const active = latest0.activeSeat;
      const view = active === 0 ? latest0 : latest1;
      const client = active === 0 ? c0 : c1;
      const legal = view.legalIntents;
      assert.ok(
        legal.length > 0,
        `no legal intents seat=${active} phase=${view.phase}`,
      );
      const end = legal.find((i) => i.type === "end_turn");
      const pick = end && guard % 5 === 0 ? end : legal[0]!;
      const beforeCount = bags[0].views.length + bags[1].views.length;
      const errBefore = bags[active].errors.length;
      client.send("intent", {
        protocolVersion: PROTOCOL_VERSION,
        intent: pick,
      });
      await waitUntil(
        () =>
          bags[0].over != null ||
          bags[1].over != null ||
          bags[0].views.length + bags[1].views.length > beforeCount ||
          bags[active].errors.length > errBefore,
        5000,
      );
      if (bags[active].errors.length > errBefore) {
        // Resync and continue (should be rare with legal picks)
        bags[active].errors.length = errBefore;
        await syncSeat(client, bags[active]);
      }
    }

    if (bags[0].over == null || bags[1].over == null) {
      await syncSeat(c0, bags[0]);
      await syncSeat(c1, bags[1]);
    }

    await waitUntil(() => bags[0].over != null && bags[1].over != null, 8000);
    assert.ok(
      bags[0].over!.result.winner === 0 || bags[0].over!.result.winner === 1,
    );
    assert.equal(bags[0].over!.result.winner, bags[1].over!.result.winner);
    assert.equal(typeof bags[0].over!.result.reason, "string");
  });

  it("rejects a third player when both seats are filled", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 1,
      autoSkipMulligan: true,
    });
    await colyseus.connectTo(room, joinOpts("a", 0));
    await colyseus.connectTo(room, joinOpts("b", 1));
    await assert.rejects(() => colyseus.connectTo(room, joinOpts("c")));
  });

  it("uses join-time seat decks for leaders", async () => {
    // A leader other than DEFAULT_LEADER_ID (ST01-001), so ignoring the join deck shows.
    const customDeck = {
      leaderId: "OP01-001",
      deck: [
        "ST01-003",
        "ST01-003",
        "ST01-003",
        "ST01-003",
        "ST01-006",
        "ST01-006",
        "ST01-006",
        "ST01-006",
        "ST01-008",
        "ST01-008",
        "ST01-008",
        "ST01-008",
        "ST01-009",
        "ST01-009",
        "ST01-009",
        "ST01-009",
        "ST01-014",
        "ST01-014",
        "ST01-014",
        "ST01-014",
      ],
    };
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 99,
      autoSkipMulligan: true,
    });

    type ViewWithLeader = PlayerView & {
      you: PlayerView["you"] & { leader: { defId: string } };
    };
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const c0 = await colyseus.connectTo(room, {
      ...joinOpts("deck-a", 0),
      deck: customDeck,
    });
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, {
      ...joinOpts("deck-b", 1),
      deck: customDeck,
    });
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);
    assert.equal((bags[0].welcome as ViewWithLeader).you.leader.defId, "OP01-001");
    assert.equal((bags[1].welcome as ViewWithLeader).you.leader.defId, "OP01-001");
  });

  it("allows a spectator with public view and empty hands", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const c0 = await colyseus.connectTo(room, joinOpts("a", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("b", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    type SpecBag = {
      welcome?: {
        role?: string;
        view: PlayerView & {
          spectator?: boolean;
          you: PlayerView["you"] & { handCount?: number };
        };
      };
      views: unknown[];
      errors: { code: string; message: string }[];
    };
    const specBag: SpecBag = { views: [], errors: [] };
    const spec = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "watcher",
      role: "spectator",
      preferredSeat: 0,
    });
    spec.onMessage("welcome", (msg: SpecBag["welcome"]) => {
      specBag.welcome = msg;
    });
    spec.onMessage("error", (msg: { code: string; message: string }) => {
      specBag.errors.push(msg);
    });
    spec.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => specBag.welcome != null, 8000);

    assert.equal(specBag.welcome!.role, "spectator");
    assert.equal(specBag.welcome!.view.spectator, true);
    assert.deepEqual(specBag.welcome!.view.you.hand, []);
    assert.ok((specBag.welcome!.view.you.handCount ?? 0) > 0);
    assert.deepEqual(specBag.welcome!.view.legalIntents, []);
  });

  it("ranked_queue pairs two clients into a duel room id", async () => {
    const c1 = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("queue-a"));
    const c2 = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("queue-b"));

    const matched = await Promise.all([
      new Promise<{ roomId: string; seat: number }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("c1 matched timeout")), 5000);
        c1.onMessage("queued", () => {});
        c1.onMessage("matched", (msg: { roomId: string; seat: number }) => {
          clearTimeout(t);
          resolve(msg);
        });
      }),
      new Promise<{ roomId: string; seat: number }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("c2 matched timeout")), 5000);
        c2.onMessage("queued", () => {});
        c2.onMessage("matched", (msg: { roomId: string; seat: number }) => {
          clearTimeout(t);
          resolve(msg);
        });
      }),
    ]);

    assert.equal(matched[0].roomId, matched[1].roomId);
    assert.notEqual(matched[0].seat, matched[1].seat);
    await c1.leave(true);
    await c2.leave(true);
  });

  it("ranked_queue skips same-user pair and matches a distinct third client", async () => {
    const dupA = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("same-user"));
    const dupB = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("same-user"));
    let earlyMatch = false;
    dupA.onMessage("matched", () => {
      earlyMatch = true;
    });
    dupB.onMessage("matched", () => {
      earlyMatch = true;
    });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(earlyMatch, false);

    const other = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("other-user"));
    const msg = await new Promise<{ roomId: string; seat: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("third matched timeout")), 5000);
      other.onMessage("matched", (m: { roomId: string; seat: number }) => {
        clearTimeout(t);
        resolve(m);
      });
      dupA.onMessage("matched", (m: { roomId: string; seat: number }) => {
        clearTimeout(t);
        resolve(m);
      });
    });
    assert.equal(typeof msg.roomId, "string");
    assert.ok(msg.seat === 0 || msg.seat === 1);
    await dupA.leave(true);
    await dupB.leave(true);
    await other.leave(true);
  });

  it("relays cosmetics artPrefs between seats", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });

    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const cosmetics: [{ seat: number; artPrefs: Record<string, string> }[], { seat: number; artPrefs: Record<string, string> }[]] = [[], []];

    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("cosmetics", (msg: { seat: number; artPrefs: Record<string, string> }) => {
      cosmetics[0].push(msg);
    });
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    c1.onMessage("cosmetics", (msg: { seat: number; artPrefs: Record<string, string> }) => {
      cosmetics[1].push(msg);
    });

    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    c0.send("cosmetics", {
      protocolVersion: PROTOCOL_VERSION,
      artPrefs: { "ST01-006": "p1" },
    });

    await waitUntil(
      () => cosmetics[0].some((m) => m.seat === 0 && m.artPrefs["ST01-006"] === "p1")
        && cosmetics[1].some((m) => m.seat === 0 && m.artPrefs["ST01-006"] === "p1"),
      5000,
    );

    assert.equal(cosmetics[1].find((m) => m.seat === 0)!.artPrefs["ST01-006"], "p1");

    await c0.leave(true);
    await c1.leave(true);
  });

  it("relays a seat's playmat / card back skin and rejects non-image payloads", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    type SkinMsg = { seat: number; skin: { playmat: string | null; cardBack: string | null } };
    const skins: SkinMsg[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    c1.onMessage("skin", (m: SkinMsg) => skins.push(m));
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    const mat = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    c0.send("skin", { protocolVersion: PROTOCOL_VERSION, skin: { playmat: mat, cardBack: null } });
    await waitUntil(() => skins.some((m) => m.seat === 0 && m.skin.playmat === mat), 5000);

    const errorsBefore = bags[0].errors.length;
    c0.send("skin", {
      protocolVersion: PROTOCOL_VERSION,
      skin: { playmat: 'data:text/html;base64,PHNjcmlwdD4=', cardBack: null },
    });
    await waitUntil(() => bags[0].errors.length > errorsBefore, 5000);
    assert.equal(skins.filter((m) => m.skin.playmat !== mat).length, 0);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("relays a cap-sized playmat and card back in one skin message", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    type SkinMsg = { seat: number; skin: { playmat: string | null; cardBack: string | null } };
    const skins: SkinMsg[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    c1.onMessage("skin", (m: SkinMsg) => skins.push(m));
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    // The duel client sends both images in one message, each up to its cap.
    const prefix = "data:image/jpeg;base64,";
    const mat = prefix + "A".repeat(SKIN_MAX_PLAYMAT_CHARS - prefix.length);
    const back = prefix + "B".repeat(SKIN_MAX_CARD_BACK_CHARS - prefix.length);
    c0.send("skin", { protocolVersion: PROTOCOL_VERSION, skin: { playmat: mat, cardBack: back } });
    await waitUntil(
      () => skins.some((m) => m.seat === 0 && m.skin.playmat === mat && m.skin.cardBack === back),
      5000,
    );

    await c0.leave(true);
    await c1.leave(true);
  });

  it("relays chat between seats, sanitizes text, and replays history on sync", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 11,
      autoSkipMulligan: true,
    });

    type Line = { id: string; seat: number; text: string };
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const chat: [Line[], Line[]] = [[], []];
    const history: Line[][] = [];

    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("chat", (msg: Line) => chat[0].push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    c1.onMessage("chat", (msg: Line) => chat[1].push(msg));
    c1.onMessage("chat_history", (msg: { messages: Line[] }) => history.push(msg.messages));

    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    c0.send("chat", { protocolVersion: PROTOCOL_VERSION, text: "  good\n luck  " });
    await waitUntil(() => chat[0].length === 1 && chat[1].length === 1, 5000);
    assert.equal(chat[1][0]!.seat, 0);
    assert.equal(chat[1][0]!.text, "good luck");

    // Whitespace-only lines are rejected, not relayed.
    c1.send("chat", { protocolVersion: PROTOCOL_VERSION, text: "   " });
    await waitUntil(() => bags[1].errors.some((e) => e.code === "bad_protocol"), 5000);
    assert.equal(chat[0].length, 1);

    // Reconnect-style sync replays the conversation.
    c1.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => history.some((h) => h.some((l) => l.text === "good luck")), 5000);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("undo: request/accept rewinds to the turn start in unranked rooms", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 21,
      autoSkipMulligan: true,
    });
    type UndoState = {
      enabled: boolean;
      targetTurn: number | null;
      pending: { from: 0 | 1; toTurn: number } | null;
    };
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const undo: [UndoState[], UndoState[]] = [[], []];
    const applied: { toTurn: number; by: number }[] = [];

    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("undo_state", (msg: UndoState) => undo[0].push(msg));
    c0.onMessage("undo_applied", (msg: { toTurn: number; by: number }) => applied.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    c1.onMessage("undo_state", (msg: UndoState) => undo[1].push(msg));
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    await waitUntil(() => undo[0].length > 0, 5000);
    assert.equal(undo[0].at(-1)!.enabled, true);
    // Nothing has happened yet: nothing to undo.
    assert.equal(undo[0].at(-1)!.targetTurn, null);

    const start = bags[0].views.at(-1)!;
    const active = start.activeSeat;
    const activeClient = active === 0 ? c0 : c1;
    const other = active === 0 ? c1 : c0;
    const startTurn = (start as unknown as { turnNumber: number }).turnNumber;
    activeClient.send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(
      () => (bags[0].views.at(-1) as unknown as { turnNumber: number }).turnNumber === startTurn + 1,
      5000,
    );
    // Fresh turn with no actions: undo targets the previous turn's start.
    await waitUntil(() => undo[1].at(-1)?.targetTurn === startTurn, 5000);

    // The requester cannot accept their own request.
    other.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await waitUntil(() => undo[0].at(-1)?.pending != null, 5000);
    other.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept" });
    const otherBag = bags[active === 0 ? 1 : 0];
    await waitUntil(() => otherBag.errors.some((e) => e.code === "unauthorized"), 5000);

    activeClient.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept" });
    await waitUntil(() => applied.length === 1, 5000);
    assert.equal(applied[0]!.toTurn, startTurn);
    await waitUntil(
      () => (bags[0].views.at(-1) as unknown as { turnNumber: number }).turnNumber === startTurn,
      5000,
    );
    assert.equal(bags[0].views.at(-1)!.activeSeat, active);
    assert.deepEqual(
      bags[0].views.at(-1)!.you.hand.map((c) => c.id),
      start.you.hand.map((c) => c.id),
    );
    assert.equal(undo[0].at(-1)!.pending, null);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("undo is disabled in ranked rooms", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 22,
      autoSkipMulligan: true,
    });
    // Force the ranked flag the matchmaker would attest.
    (room as unknown as { ranked: boolean }).ranked = true;
    const bag: SeatBag = { views: [], errors: [] };
    const states: { enabled: boolean }[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bag);
    c0.onMessage("undo_state", (msg: { enabled: boolean }) => states.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, { views: [], errors: [] });
    await syncSeat(c0, bag);
    await waitUntil(() => states.length > 0, 5000);
    assert.equal(states.at(-1)!.enabled, false);
    c0.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await waitUntil(() => bag.errors.some((e) => e.code === "unauthorized"), 5000);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("a player leaving mid-match forfeits it to the one still seated", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 31,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    await c0.leave(true);
    await waitUntil(() => bags[1].over != null, 8000);
    assert.equal(bags[1].over!.result.winner, 1);
    assert.equal(bags[1].over!.result.reason, "abandoned");

    // The vacated seat can't be taken over by a new player.
    // The server rejects and closes the socket, so connecting may itself throw.
    const intruder: SeatBag = { views: [], errors: [] };
    try {
      const c2 = await colyseus.connectTo(room, joinOpts("mallory", 0));
      attach(c2, intruder);
    } catch {
      /* closed before the client could attach: also a rejection */
    }
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(intruder.views.length, 0);
    assert.equal(bags[1].over!.result.winner, 1);
    await c1.leave(true);
  });

  it("per-player clock: the seat whose bank runs out loses", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 32,
      autoSkipMulligan: true,
      timer: { seatSeconds: 1 },
    });
    type Timer = { seatSeconds: number | null; seatRemainingMs: [number, number] | null; clockSeat: 0 | 1 | null };
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const timers: Timer[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("timer", (msg: Timer) => timers.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    await waitUntil(() => timers.some((t) => t.clockSeat != null), 5000);
    const running = timers.find((t) => t.clockSeat != null)!;
    assert.equal(running.seatSeconds, 1);
    const active = bags[0].views.at(-1)!.activeSeat;
    assert.equal(running.clockSeat, active);
    // Nobody acts: the active seat's 1s bank runs out.
    await waitUntil(() => bags[0].over != null, 8000);
    assert.equal(bags[0].over!.result.winner, active === 0 ? 1 : 0);
    assert.equal(bags[0].over!.result.reason, "timeout");

    await c0.leave(true);
    await c1.leave(true);
  });

  it("rematch: both agree, the loser picks turn order, a fresh game starts", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 41,
      autoSkipMulligan: true,
    });
    type Rematch = { available: boolean; requested: [boolean, boolean]; chooser: 0 | 1 | null; declinedBy: 0 | 1 | null };
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const rematch: Rematch[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("rematch_state", (msg: Rematch) => rematch.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    // Seat 0 concedes: seat 0 lost and will pick the turn order.
    c0.send("concede", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => rematch.some((r) => r.available), 8000);

    // Only the loser may choose, and only after both agree.
    c0.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await waitUntil(() => rematch.at(-1)!.requested[0], 5000);
    assert.equal(rematch.at(-1)!.chooser, null);
    c1.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await waitUntil(() => rematch.at(-1)!.chooser === 0, 5000);
    c1.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "first" });
    await waitUntil(() => bags[1].errors.some((e) => e.code === "unauthorized"), 5000);

    const welcomesBefore = bags[0].views.length;
    bags[0].welcome = undefined;
    c0.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "second" });
    await waitUntil(() => bags[0].welcome != null && bags[0].views.length > welcomesBefore, 5000);
    const fresh = bags[0].views.at(-1)! as PlayerView & { firstSeat?: number; turnNumber: number };
    assert.equal(fresh.winner, null);
    assert.equal(fresh.firstSeat, 1);
    assert.equal(fresh.you.lifeCount > 0, true);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("rate-limits chat bursts", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 12,
      autoSkipMulligan: true,
    });
    const bag: SeatBag = { views: [], errors: [] };
    const relayed: string[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bag);
    c0.onMessage("chat", (msg: { text: string }) => relayed.push(msg.text));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, { views: [], errors: [] });
    await syncSeat(c0, bag);

    for (let i = 0; i < 8; i += 1) {
      c0.send("chat", { protocolVersion: PROTOCOL_VERSION, text: `msg ${i}` });
    }
    await waitUntil(() => bag.errors.some((e) => e.code === "rate_limited"), 5000);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(relayed.length, 5);

    await c0.leave(true);
    await c1.leave(true);
  });


  it("friends presence: reports seats as waiting, then playing, and spectators by role", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });
    await colyseus.connectTo(room, { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(101), preferredSeat: 0 });
    await waitUntil(() => presenceFor(room.roomId).length === 1, 8000);
    assert.deepEqual(presenceFor(room.roomId), [
      { user_id: 101, room_id: room.roomId, role: "player", phase: "waiting", ranked: false },
    ]);

    await colyseus.connectTo(room, { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(102), preferredSeat: 1 });
    await waitUntil(() => presenceFor(room.roomId).length === 2, 8000);
    assert.deepEqual(
      presenceFor(room.roomId).map((e) => [e.user_id, e.role, e.phase]),
      [
        [101, "player", "playing"],
        [102, "player", "playing"],
      ],
    );

    const spec = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      gameToken: gameToken(103),
      role: "spectator",
    });
    await waitUntil(() => presenceFor(room.roomId).length === 3, 8000);
    assert.deepEqual(
      presenceFor(room.roomId).find((e) => e.user_id === 103),
      { user_id: 103, room_id: room.roomId, role: "spectator", phase: "playing", ranked: false },
    );

    await spec.leave();
    await waitUntil(() => presenceFor(room.roomId).length === 2, 8000);
  });
});
