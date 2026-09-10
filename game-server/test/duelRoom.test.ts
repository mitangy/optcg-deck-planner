import assert from "node:assert/strict";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import appConfig from "../src/app.config.js";
import { PROTOCOL_VERSION } from "../src/protocol.js";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";

type PlayerView = {
  seat: 0 | 1;
  you: { hand: { id: string; defId: string }[] };
  opponent: { handCount: number };
  legalIntents: (Record<string, unknown> & { type: string })[];
  winner: 0 | 1 | null;
  phase: string;
  activeSeat: 0 | 1;
};

type SeatBag = {
  welcome?: PlayerView;
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
  client.onMessage("welcome", (msg: { seat: 0 | 1; view: PlayerView }) => {
    bag.welcome = msg.view;
    bag.views.push(msg.view);
  });
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

    const ids0 = bags[0].welcome!.you.hand.map((c) => c.id);
    const ids1 = bags[1].welcome!.you.hand.map((c) => c.id);
    const dump0 = JSON.stringify(bags[0].welcome);
    const dump1 = JSON.stringify(bags[1].welcome);
    for (const id of ids1) assert.equal(dump0.includes(id), false);
    for (const id of ids0) assert.equal(dump1.includes(id), false);
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

  it("rejects a third joiner when the room is full", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 1,
      autoSkipMulligan: true,
    });
    await colyseus.connectTo(room, joinOpts("a", 0));
    await colyseus.connectTo(room, joinOpts("b", 1));
    await assert.rejects(() => colyseus.connectTo(room, joinOpts("c")));
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
});
