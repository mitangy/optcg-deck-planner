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
import { getGameTokenSecret, getRankedMatchCreateSecret } from "../src/env.js";
import { MAX_ROOMS_PER_CREATOR } from "../src/matchmakeGuard.js";
import { matchMaker } from "colyseus";
import { createHmac } from "node:crypto";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";
import type { MatchProgressPayload, MatchResultPayload } from "../src/writeback.js";
import { replayMatch, serializeMatch, type MatchReplay, type MatchState } from "@optcg/rules";

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

/** Runs `fn` with REQUIRE_GAME_TOKEN=true, as on the deployed server. */
async function withTokensRequired<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env.REQUIRE_GAME_TOKEN;
  process.env.REQUIRE_GAME_TOKEN = "true";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.REQUIRE_GAME_TOKEN;
    else process.env.REQUIRE_GAME_TOKEN = prev;
  }
}

function presenceFor(roomId: string): PresenceEntry[] {
  return presence
    .snapshot()
    .filter((e) => e.room_id === roomId)
    .sort((a, b) => a.user_id - b.user_id);
}

/** Server-side room internals the replay tests read. */
type RoomInternals = {
  match: MatchState;
  replay: MatchReplay | null;
  expireTurnClock(): void;
  matchEndsAt: number | null;
  clockSeat: 0 | 1 | null;
  seatRemainingMs: [number, number];
  resultPayload(s0: number, s1: number, winner: 0 | 1, reason: string): MatchResultPayload;
};
const internals = (room: DuelRoom) => room as unknown as RoomInternals;

/** Send `steps` legal intents from whichever seat can act, ending the turn now and then. */
async function playSome(clients: [ClientRoom, ClientRoom], bags: [SeatBag, SeatBag], steps: number) {
  for (let i = 0; i < steps; i++) {
    const seat = ([0, 1] as const).find((s) => bags[s].views.at(-1)!.winner == null && bags[s].views.at(-1)!.legalIntents.length > 0);
    if (seat === undefined) return;
    const legal = bags[seat].views.at(-1)!.legalIntents;
    const pick = i % 4 === 3 ? (legal.find((x) => x.type === "end_turn") ?? legal[0]!) : legal[0]!;
    const seen: [number, number] = [bags[0].views.length, bags[1].views.length];
    const errs = bags[seat].errors.length;
    clients[seat].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: pick });
    await waitUntil(
      () => (bags[0].views.length > seen[0] && bags[1].views.length > seen[1]) || bags[seat].errors.length > errs,
      5000,
    );
  }
}

/** The recorded replay, re-run through the engine, lands on the room's exact state. */
function assertReplayRebuilds(room: DuelRoom) {
  const { match, replay } = internals(room);
  assert.ok(replay, "room has a replay");
  assert.equal(serializeMatch(replayMatch(replay)), serializeMatch(match));
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

  it("rejects a deck with unknown cards at join; valid seats still start the match", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 7,
      autoSkipMulligan: true,
    });
    // Keep the room alive while it is empty after the rejected join.
    room.autoDispose = false;
    const badDeck = { leaderId: "ST01-001", deck: Array.from({ length: 50 }, () => "ZZ99-999") };
    await assert.rejects(
      () => colyseus.connectTo(room, { ...joinOpts("alice", 0), deck: badDeck }),
      /Unknown card def: ZZ99-999/,
    );
    assert.equal(room.state.seatsFilled, 0, "the rejected host must not hold a seat");

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
  });

  type SpecWelcome = {
    role?: string;
    view: PlayerView & {
      spectator?: boolean;
      you: PlayerView["you"] & { handCount?: number };
      revealedHands?: [{ id: string; defId: string }[], { id: string; defId: string }[]];
    };
  };

  /** Seat two players, then join a spectator on seat 0's camera. */
  async function watchRoom(createOpts: Record<string, unknown>) {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: true,
      ...createOpts,
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

    let welcome: SpecWelcome | undefined;
    const spec = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "watcher",
      role: "spectator",
      preferredSeat: 0,
    });
    spec.onMessage("welcome", (msg: SpecWelcome) => {
      welcome = msg;
    });
    const specViews: SpecWelcome["view"][] = [];
    const specErrors: { code: string; message: string }[] = [];
    spec.onMessage("view", (msg: { view: SpecWelcome["view"] }) => {
      specViews.push(msg.view);
    });
    spec.onMessage("error", (msg: { code: string; message: string }) => {
      specErrors.push(msg);
    });
    spec.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => welcome != null && specViews.length > 0, 8000);
    // Views from here on are updates, not the join's own.
    specViews.length = 0;
    return { welcome: welcome!, bags, room, c0, c1, spec, specViews, specErrors };
  }

  it("allows a spectator with public view and empty hands", async () => {
    const { welcome } = await watchRoom({});
    assert.equal(welcome.role, "spectator");
    assert.equal(welcome.view.spectator, true);
    assert.deepEqual(welcome.view.you.hand, []);
    assert.ok((welcome.view.you.handCount ?? 0) > 0);
    assert.deepEqual(welcome.view.legalIntents, []);
  });

  it("spectators of an unranked room see both players' hands (#250)", async () => {
    const { welcome, bags } = await watchRoom({});
    const ids = (hand: { id: string }[] | undefined) => (hand ?? []).map((c) => c.id);
    assert.ok(bags[0].welcome!.you.hand.length > 0);
    assert.deepEqual(ids(welcome.view.revealedHands?.[0]), ids(bags[0].welcome!.you.hand));
    assert.deepEqual(ids(welcome.view.revealedHands?.[1]), ids(bags[1].welcome!.you.hand));
  });

  it("spectators of a ranked room see no hands (#250)", async () => {
    const { welcome } = await watchRoom({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
    assert.equal(welcome.view.revealedHands, undefined);
    assert.deepEqual(welcome.view.you.hand, []);
  });

  const handIds = (hand: { id: string }[] | undefined) => (hand ?? []).map((c) => c.id);

  type RawWelcome = {
    seat: 0 | 1;
    role?: string;
    ranked?: boolean;
    brief?: { ticket: string; leaderId: string; opponentId: string; deck: string[] };
  };
  const ticketClaims = (ticket: string) =>
    JSON.parse(Buffer.from(ticket.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
  const zoroDeckFor = (extra: string) => ({
    leaderId: "OP01-001",
    deck: ["ST01-003", "ST01-006", "ST01-008", "ST01-009", extra].flatMap((id) => [id, id, id, id]),
  });
  const luffyDeck = { leaderId: "ST01-001", deck: ["ST01-003", "ST01-006", "ST01-008", "ST01-009", "ST01-014"].flatMap((id) => [id, id, id, id]) };

  /** Two seats with different leaders and decks (one card apart), plus a spectator, keeping each raw welcome. */
  async function briefRoom(createOpts: Record<string, unknown>, decks: boolean) {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: true,
      ...createOpts,
    });
    const welcomes: RawWelcome[] = [];
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const seatDeck = (d: unknown) => (decks ? { deck: d } : {});
    const c0 = await colyseus.connectTo(room, { ...joinOpts("a", 0), ...seatDeck(zoroDeckFor("ST01-013")) });
    attach(c0, bags[0]);
    c0.onMessage("welcome", (m: RawWelcome) => welcomes.push(m));
    const c1 = await colyseus.connectTo(room, { ...joinOpts("b", 1), ...seatDeck(luffyDeck) });
    attach(c1, bags[1]);
    c1.onMessage("welcome", (m: RawWelcome) => welcomes.push(m));
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);
    const spec = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "watcher",
      role: "spectator",
      preferredSeat: 0,
    });
    spec.onMessage("welcome", (m: RawWelcome) => welcomes.push(m));
    spec.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => welcomes.some((w) => w.role === "spectator"), 8000);
    return { room, welcomes };
  }

  it("an unranked room gives each player a brief ticket for their own seat and the other seat's leader (#401)", async () => {
    const { welcomes } = await briefRoom({}, true);
    const w0 = welcomes.find((w) => w.role === "player" && w.seat === 0)!;
    const w1 = welcomes.find((w) => w.role === "player" && w.seat === 1)!;
    assert.equal(w0.ranked, false);
    assert.equal(w0.brief!.leaderId, "OP01-001");
    assert.equal(w0.brief!.opponentId, "ST01-001");
    assert.equal(w1.brief!.leaderId, "ST01-001");
    assert.equal(w1.brief!.opponentId, "OP01-001");
    assert.equal(w0.brief!.deck.length, 20);
    assert.notDeepEqual(w0.brief!.deck, w1.brief!.deck);
    const c0 = ticketClaims(w0.brief!.ticket);
    assert.equal(c0.seat, 0);
    assert.equal(c0.leader, "OP01-001");
    assert.equal(c0.opponent, "ST01-001");
    assert.deepEqual(c0.deck, w0.brief!.deck);
    const c1 = ticketClaims(w1.brief!.ticket);
    assert.equal(c1.leader, "ST01-001");
    assert.equal(c1.opponent, "OP01-001");
  });

  it("a ranked room's welcome says ranked and carries no brief ticket (#401)", async () => {
    const { welcomes } = await briefRoom({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() }, false);
    const players = welcomes.filter((w) => w.role === "player");
    assert.deepEqual(new Set(players.map((w) => w.seat)), new Set([0, 1]));
    for (const w of players) {
      assert.equal(w.ranked, true);
      assert.equal(w.brief, undefined);
    }
  });

  it("spectators never get a brief ticket (#401)", async () => {
    const { welcomes } = await briefRoom({}, true);
    const spec = welcomes.find((w) => w.role === "spectator")!;
    assert.equal(spec.ranked, false);
    assert.equal(spec.brief, undefined);
  });

  it("a player's hand_order reorders the hands spectators see, and the other player is unaffected (#346)", async () => {
    const { welcome, bags, c0, specViews } = await watchRoom({});
    const engine = handIds(welcome.view.revealedHands?.[0]);
    const mine = bags[0].welcome!.you.hand.map((c) => c.id);
    assert.deepEqual(engine, mine);
    const reversed = [...engine].reverse();
    const seatOneBefore = handIds(welcome.view.revealedHands?.[1]);
    const opponentViews = bags[1].views.length;
    c0.send("hand_order", { ids: reversed });
    await waitUntil(() => handIds(specViews.at(-1)?.revealedHands?.[0]).join() === reversed.join(), 5000);
    // The other hand is untouched, and a new spectator joining later sees the order too.
    assert.deepEqual(handIds(specViews.at(-1)?.revealedHands?.[1]), seatOneBefore);
    // Nothing about it reaches the other player.
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(bags[1].views.length, opponentViews);
    assert.deepEqual(bags[1].views.at(-1)!.you.hand.map((c) => c.id), seatOneBefore);
  });

  it("hand_order ids not in the sender's hand are ignored, and cards left out keep engine order at the end (#346)", async () => {
    const { welcome, bags, c0, c1, specViews } = await watchRoom({});
    const engine = handIds(welcome.view.revealedHands?.[0]);
    const theirs = handIds(welcome.view.revealedHands?.[1]);
    // Seat 0 names one of seat 1's cards and an invented id, plus only two of its own cards.
    c0.send("hand_order", { ids: [theirs[0]!, "no-such-card", engine[3]!, engine[1]!] });
    await waitUntil(() => specViews.length > 0, 5000);
    const shown = handIds(specViews.at(-1)!.revealedHands?.[0]);
    assert.deepEqual(shown, [engine[3], engine[1], engine[0], engine[2], engine[4]]);
    assert.deepEqual(handIds(specViews.at(-1)!.revealedHands?.[1]), theirs);
    assert.deepEqual(bags[0].errors, []);
    void c1;
  });

  it("a spectator cannot send hand_order, and a malformed one is a protocol error (#346)", async () => {
    const { welcome, bags, c0, spec, specViews, specErrors } = await watchRoom({});
    const engine = handIds(welcome.view.revealedHands?.[0]);
    spec.send("hand_order", { ids: [...engine].reverse() });
    await waitUntil(() => specErrors.length > 0, 5000);
    assert.equal(specErrors[0]!.code, "unauthorized");
    assert.equal(specViews.length, 0, "no new view for a rejected order");
    c0.send("hand_order", { ids: "nope" });
    c0.send("hand_order", { ids: Array.from({ length: 101 }, (_, i) => `c${i}`) });
    c0.send("hand_order", { ids: ["x".repeat(65)] });
    await waitUntil(() => bags[0].errors.length >= 3, 5000);
    assert.deepEqual(bags[0].errors.map((e) => e.code), ["bad_protocol", "bad_protocol", "bad_protocol"]);
    assert.equal(specViews.length, 0);
  });

  it("an unchanged hand_order does not resend the spectator view (#346)", async () => {
    const { welcome, c0, specViews } = await watchRoom({});
    const reversed = handIds(welcome.view.revealedHands?.[0]).reverse();
    c0.send("hand_order", { ids: reversed });
    await waitUntil(() => specViews.length === 1, 5000);
    c0.send("hand_order", { ids: reversed });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(specViews.length, 1);
  });

  it("a ranked room keeps hands hidden whatever hand_order says (#346)", async () => {
    const { welcome, bags, c0, specViews } = await watchRoom({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
    c0.send("hand_order", { ids: bags[0].welcome!.you.hand.map((c) => c.id).reverse() });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(specViews.length, 0);
    assert.equal(welcome.view.revealedHands, undefined);
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

  it("ranked_queue keeps one place per account, dropping the older entry (#318)", async () => {
    const dupA = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("same-user"));
    let aLeft = false;
    dupA.onLeave(() => {
      aLeft = true;
    });
    const dupB = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("same-user"));
    await waitUntil(() => aLeft, 3000);

    const other = await colyseus.sdk.joinOrCreate("ranked_queue", joinOpts("other-user"));
    const [mine, theirs] = await Promise.all(
      [dupB, other].map(
        (c) =>
          new Promise<{ roomId: string; seat: number }>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("matched timeout")), 5000);
            c.onMessage("matched", (m: { roomId: string; seat: number }) => {
              clearTimeout(t);
              resolve(m);
            });
          }),
      ),
    );
    assert.equal(mine!.roomId, theirs!.roomId);
    assert.notEqual(mine!.seat, theirs!.seat);
    await dupB.leave(true);
    await other.leave(true);
  });

  it("ranked_queue turns away a deck ranked can't play before pairing it (#302)", async () => {
    // P-064 has no verified card data, so a ranked room would refuse it at join.
    const unverified = { leaderId: "OP01-001", deck: ["P-064"] };
    await assert.rejects(
      () => colyseus.sdk.joinOrCreate("ranked_queue", { ...joinOpts("queue-bad"), deck: unverified }),
      /unsupported cards: P-064/,
    );
    const ok = await colyseus.sdk.joinOrCreate("ranked_queue", {
      ...joinOpts("queue-good"),
      deck: { leaderId: "OP01-001", deck: ["ST01-003"] },
    });
    await ok.leave(true);
  });

  it("a paired ranked room sends the waiting player back when the opponent never joins (#302)", async () => {
    const prev = process.env.RANKED_NO_SHOW_SECONDS;
    process.env.RANKED_NO_SHOW_SECONDS = "0.3";
    let room: DuelRoom;
    try {
      room = await colyseus.createRoom<DuelRoom>("duel", {
        protocolVersion: PROTOCOL_VERSION,
        ranked: true,
        rankedAttestation: getRankedMatchCreateSecret(),
        seatUserIds: [41, 42],
      });
    } finally {
      if (prev === undefined) delete process.env.RANKED_NO_SHOW_SECONDS;
      else process.env.RANKED_NO_SHOW_SECONDS = prev;
    }
    const bag: SeatBag = { views: [], errors: [] };
    const c1 = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      gameToken: gameToken(42),
      preferredSeat: 1,
    });
    attach(c1, bag);
    let left = false;
    c1.onLeave(() => {
      left = true;
    });
    await waitUntil(() => left, 5000);
    assert.deepEqual(bag.errors.map((e) => e.code), ["opponent_no_show"]);
  });

  it("relays cosmetics only for cards already public to the other seat and spectators (#369)", async () => {
    type Cos = { seat: number; artPrefs: Record<string, string> };
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

    // A leader is public from the start; the other card sits unseen in seat 0's deck or hand.
    const hidden = "ST01-006";
    assert.ok(!internals(room).match.players[0].trash.includes(hidden));
    c0.send("cosmetics", {
      protocolVersion: PROTOCOL_VERSION,
      artPrefs: { "ST01-001": "leaderAlt", [hidden]: "p1" },
    });
    await waitUntil(() => cosmetics[0].some((m) => m.seat === 0) && cosmetics[1].some((m) => m.seat === 0), 5000);
    assert.deepEqual(cosmetics[0].find((m) => m.seat === 0)!.artPrefs, { "ST01-001": "leaderAlt", [hidden]: "p1" });
    assert.deepEqual(cosmetics[1].find((m) => m.seat === 0)!.artPrefs, { "ST01-001": "leaderAlt" });

    // A spectator joining later gets the same filtered map.
    const specCos: Cos[] = [];
    const spec = await colyseus.connectTo(room, {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "watcher",
      role: "spectator",
      preferredSeat: 0,
    });
    spec.onMessage("cosmetics", (msg: Cos) => specCos.push(msg));
    spec.onMessage("error", () => {});
    spec.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => specCos.some((m) => m.seat === 0), 5000);
    assert.deepEqual(specCos.find((m) => m.seat === 0)!.artPrefs, { "ST01-001": "leaderAlt" });

    // Once the card is played face-up, everyone gets the entry.
    (room as unknown as { broadcastViews(e: unknown[]): void }).broadcastViews([
      { type: "card_played", seat: 0, defId: hidden, instanceId: "x", costPaid: 0 },
    ]);
    await waitUntil(() => cosmetics[1].some((m) => m.seat === 0 && m.artPrefs[hidden] === "p1"), 5000);
    await waitUntil(() => specCos.some((m) => m.seat === 0 && m.artPrefs[hidden] === "p1"), 5000);

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
  it("the recorded replay rebuilds the game, including turn-clock auto moves (#244)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 51,
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

    await playSome([c0, c1], bags, 12);
    const played = internals(room).replay!.intents.length;
    assert.ok(played >= 8, `recorded ${played} intents`);
    // The turn clock running out makes a move for the seat that must act.
    const turnBefore = internals(room).match.turnNumber;
    internals(room).expireTurnClock();
    assert.equal(internals(room).replay!.intents.length, played + 1);
    assert.ok(internals(room).match.turnNumber >= turnBefore);
    assertReplayRebuilds(room);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("an accepted undo drops the rewound moves from the replay (#244)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 52,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const applied: unknown[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("undo_applied", (msg: unknown) => applied.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    const active = bags[0].views.at(-1)!.activeSeat;
    const clients: [ClientRoom, ClientRoom] = [c0, c1];
    clients[active].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(() => internals(room).match.activeSeat !== active, 5000);
    const atTurnStart = internals(room).replay!.intents.length;
    // The next player acts, then asks to take it back.
    const next = (1 - active) as 0 | 1;
    await waitUntil(() => bags[next].views.at(-1)!.activeSeat === next, 5000);
    clients[next].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(() => internals(room).replay!.intents.length > atTurnStart, 5000);
    clients[active].send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await new Promise((r) => setTimeout(r, 50));
    clients[next].send("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept" });
    await waitUntil(() => applied.length === 1, 5000);

    assert.ok(internals(room).replay!.intents.length < atTurnStart + 1);
    assertReplayRebuilds(room);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("an accepted undo re-seeds the rng instead of restoring it, and the replay still rebuilds (#369)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 53,
      autoSkipMulligan: true,
    });
    Object.assign(room, { freshSeed: () => 777_001 });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const applied: unknown[] = [];
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    c0.onMessage("undo_applied", (msg: unknown) => applied.push(msg));
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);

    const active = bags[0].views.at(-1)!.activeSeat;
    const clients: [ClientRoom, ClientRoom] = [c0, c1];
    clients[active].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(() => internals(room).match.activeSeat !== active, 5000);
    const atTurnStart = internals(room).replay!.intents.length;
    const next = (1 - active) as 0 | 1;
    await waitUntil(() => bags[next].views.at(-1)!.activeSeat === next, 5000);
    clients[next].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(() => internals(room).replay!.intents.length > atTurnStart, 5000);
    clients[active].send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request" });
    await new Promise((r) => setTimeout(r, 50));
    clients[next].send("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept" });
    await waitUntil(() => applied.length === 1, 5000);

    assert.equal(internals(room).match.rng.seed, 777_001);
    assert.deepEqual(internals(room).replay!.reseeds, [{ atIntent: atTurnStart, seed: 777_001, shuffleDecks: true }]);
    // Both players saw their next draws, so the decks are reshuffled: same cards, new order.
    const snapped = JSON.parse((room as unknown as { turnSnapshots: { match: string }[] }).turnSnapshots.at(-1)!.match) as MatchState;
    for (const seat of [0, 1] as const) {
      const now = internals(room).match.players[seat];
      const was = snapped.players[seat];
      assert.deepEqual([...now.zoneInstanceIds.deck].sort(), [...was.zoneInstanceIds.deck].sort());
      assert.notDeepEqual(now.zoneInstanceIds.deck, was.zoneInstanceIds.deck);
      assert.deepEqual(now.life, was.life);
      assert.equal(now.deck.length, now.zoneInstanceIds.deck.length);
    }
    // The game goes on from the new seed and the recording still rebuilds it.
    const moved = internals(room).replay!.intents.length;
    clients[next].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "end_turn" } });
    await waitUntil(() => internals(room).replay!.intents.length > moved, 5000);
    assert.equal(internals(room).match.rng.seed, 777_001);
    assertReplayRebuilds(room);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("an unfinished game's log is saved at the start of every turn and when the room closes (#316)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 61,
      autoSkipMulligan: true,
    });
    const sent: { matchId: string; payload: MatchProgressPayload }[] = [];
    // Real accounts, with the API calls captured instead of sent.
    Object.assign(room, {
      ingestSeats: () => [101, 102],
      persistMatchProgress: async (matchId: string, payload: MatchProgressPayload) => {
        sent.push({ matchId, payload });
      },
      persistMatchResult: async () => {},
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
    await playSome([c0, c1], bags, 12);
    // Act once more without ending the turn, so the closing snapshot has something new.
    const actor = ([0, 1] as const).find((s) => bags[s].views.at(-1)!.legalIntents.some((x) => x.type !== "end_turn"))!;
    const move = bags[actor].views.at(-1)!.legalIntents.find((x) => x.type !== "end_turn")!;
    const before = internals(room).replay!.intents.length;
    (actor === 0 ? c0 : c1).send("intent", { protocolVersion: PROTOCOL_VERSION, intent: move });
    await waitUntil(() => internals(room).replay!.intents.length > before, 5000);
    const { match, replay } = internals(room);
    assert.ok(match.turnNumber > 2, "several turns were played");

    // One snapshot per turn, each with both seats' logs up to that turn.
    const turns = sent.map((s) => s.payload.turns);
    assert.deepEqual(turns, [...new Set(turns)].sort((a, b) => a! - b!));
    assert.equal(turns.at(-1), match.turnNumber);
    const last = sent.at(-1)!.payload;
    assert.equal(last.seat0_user_id, 101);
    assert.deepEqual(last.seat_logs!.map((l) => l.seat), [0, 1]);
    assert.equal(last.seat_logs![1].turns.at(-1)!.turn, match.turnNumber);
    assert.equal(sent.at(-1)!.matchId, room.roomId);

    // Both players leave mid-turn: no result, but the log keeps every action.
    const intents = replay!.intents.length;
    assert.ok(last.replay!.intents.length < intents, "this turn has actions the turn-start snapshot lacks");
    await c0.leave(true);
    await c1.leave(true);
    await waitUntil(() => sent.at(-1)!.payload.replay!.intents.length === intents, 5000);
  });

  it("a live game's progress snapshots hide the opponent's hand; the result and a cut-off log show it (#359)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 67,
      autoSkipMulligan: true,
    });
    const sent: MatchProgressPayload[] = [];
    Object.assign(room, {
      ingestSeats: () => [101, 102],
      persistMatchProgress: async (_matchId: string, payload: MatchProgressPayload) => {
        sent.push(payload);
      },
      persistMatchResult: async () => {},
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
    await playSome([c0, c1], bags, 6);
    assert.ok(sent.length > 0, "turn snapshots were sent");
    for (const payload of sent) {
      const text = JSON.stringify(payload.seat_logs);
      assert.ok(!text.includes('"opponentHand"'), "no opponent hand in a live snapshot");
      assert.ok(!text.includes('"opponentOpeningHand"'));
    }

    // The hand count stays in a live snapshot, so the page can still show it.
    assert.ok(sent.at(-1)!.seat_logs![0].turns.some((t) => t.opponentHandCount != null));

    const result = internals(room).resultPayload(11, 12, 0, "concede");
    for (const log of result.seat_logs!) {
      assert.ok(log.opponentOpeningHand!.length > 0);
      assert.ok(log.turns.some((t) => t.opponentHand && t.opponentHand.length > 0));
    }

    // Both players leave: the room closes without a result and its last snapshot reveals the hands.
    const live = sent.length;
    await c0.leave(true);
    await c1.leave(true);
    await waitUntil(() => sent.length > live, 5000);
    const closing = sent.at(-1)!.seat_logs!;
    assert.ok(closing.every((l) => l.opponentOpeningHand && l.turns.some((t) => t.opponentHand)));
  });

  it("the result sent to the backend carries leaders, turns, the replay, each seat's log and how it ended (#244, #252)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 53,
      autoSkipMulligan: true,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    // Seat 0 brings OP01-001; seat 1 gets the default ST01-001, so swapped seats show.
    const zoroDeck = { leaderId: "OP01-001", deck: ["ST01-003", "ST01-006", "ST01-008", "ST01-009", "ST01-014"].flatMap((id) => [id, id, id, id]) };
    const c0 = await colyseus.connectTo(room, { ...joinOpts("alice", 0), deck: zoroDeck });
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, joinOpts("bob", 1));
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);
    await playSome([c0, c1], bags, 6);

    c1.send("concede", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => bags[0].over != null, 8000);
    const { match, replay } = internals(room);
    const payload = internals(room).resultPayload(11, 12, 0, "concede");
    assert.equal(match.players[0].leader.defId, "OP01-001");
    assert.equal(payload.seat0_leader_id, "OP01-001");
    assert.equal(payload.seat1_leader_id, "ST01-001");
    assert.equal(payload.turns, match.turnNumber);
    assert.ok(payload.turns! > 1);
    assert.deepEqual(payload.replay!.end, { winner: 0, reason: "concede" });
    assert.equal(payload.replay!.seed, 53);
    assert.deepEqual(payload.replay!.intents, replay!.intents);
    // The engine never saw the concession: replaying the intents alone leaves the game running.
    assert.equal(replayMatch(payload.replay!).winner, null);
    // Each seat gets its own log of the same game, numbered like the room's turns.
    assert.deepEqual(payload.seat_logs!.map((l) => l.seat), [0, 1]);
    assert.equal(payload.seat_logs![0].turns.at(-1)!.turn, match.turnNumber);

    await c0.leave(true);
    await c1.leave(true);
  });

  it("match clock: a seat that never answers its mulligan loses on time, not the first player (#248)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: false,
      timer: { matchSeconds: 900 },
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
    assert.equal(bags[0].welcome!.phase, "mulligan");

    // The active seat keeps; the other seat stalls on its mulligan.
    const active = internals(room).match.activeSeat;
    const clients = [c0, c1] as const;
    clients[active].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "mulligan", doMulligan: false } });
    await waitUntil(() => internals(room).match.players[active].mulliganDone, 5000);

    internals(room).matchEndsAt = Date.now() - 1;
    await waitUntil(() => bags[0].over != null, 5000);
    assert.deepEqual(bags[0].over!.result, { winner: active, reason: "match_timeout" });

    await c0.leave(true);
    await c1.leave(true);
  });

  it("per-player clock: a seat that stalls its mulligan runs its own bank down and loses on time (#349)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: false,
      timer: { seatSeconds: 900 },
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
    assert.equal(bags[0].welcome!.phase, "mulligan");

    // Nobody has answered: the clock runs for the first player.
    const active = internals(room).match.activeSeat as 0 | 1;
    const other = (1 - active) as 0 | 1;
    assert.equal(internals(room).clockSeat, active);

    // The active seat keeps; the clock moves to the seat that has yet to answer.
    const clients = [c0, c1] as const;
    clients[active].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: { type: "mulligan", doMulligan: false } });
    await waitUntil(() => internals(room).match.players[active].mulliganDone, 5000);
    assert.equal(internals(room).clockSeat, other);

    // The staller's bank empties while the answered seat's bank is untouched.
    internals(room).seatRemainingMs[other] = 1;
    await waitUntil(() => bags[0].over != null, 5000);
    assert.deepEqual(bags[0].over!.result, { winner: active, reason: "timeout" });

    await c0.leave(true);
    await c1.leave(true);
  });

  /** Seat 1 brings an Imu leader (mandatory start-of-game Stage prompt); seat 0 is the first player. */
  async function imuSecondRoom(timer: Record<string, number>) {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 8,
      autoSkipMulligan: false,
      timer,
    });
    const bags: [SeatBag, SeatBag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const imuDeck = {
      leaderId: "OP13-079",
      deck: ["OP13-099", "ST01-003", "ST01-006", "ST01-008", "ST01-009", "ST01-014"].flatMap((id) => [id, id, id, id]),
    };
    const c0 = await colyseus.connectTo(room, joinOpts("alice", 0));
    attach(c0, bags[0]);
    const c1 = await colyseus.connectTo(room, { ...joinOpts("bob", 1), deck: imuDeck });
    attach(c1, bags[1]);
    await syncSeat(c0, bags[0]);
    await syncSeat(c1, bags[1]);
    const m = internals(room).match;
    assert.equal(m.phase, "mulligan");
    assert.equal(m.activeSeat, 0);
    assert.equal(m.pendingChoices[0]?.seat, 1, "the Imu seat owes the Stage prompt");
    return { room, c0, c1, bags };
  }

  it("per-player clock: the Imu seat's open Stage prompt drains its own bank, not the first player's (#353)", async () => {
    const { room, c0, c1, bags } = await imuSecondRoom({ seatSeconds: 900 });
    assert.equal(internals(room).clockSeat, 1);

    // Seat 0 cannot mulligan yet, so its bank must hold while seat 1's runs out.
    internals(room).seatRemainingMs[0] = 1;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(internals(room).match.winner, null);
    assert.equal(bags[0].over, undefined);

    internals(room).seatRemainingMs[1] = 1;
    await waitUntil(() => bags[0].over != null, 5000);
    assert.deepEqual(bags[0].over!.result, { winner: 0, reason: "timeout" });

    await c0.leave(true);
    await c1.leave(true);
  });

  it("match clock: expiry while the Imu seat's Stage prompt is open names the prompt owner the loser (#353)", async () => {
    const { room, c0, c1, bags } = await imuSecondRoom({ matchSeconds: 900 });

    internals(room).matchEndsAt = Date.now() - 1;
    await waitUntil(() => bags[0].over != null, 5000);
    assert.deepEqual(bags[0].over!.result, { winner: 0, reason: "match_timeout" });

    await c0.leave(true);
    await c1.leave(true);
  });

  it("match clock: a defender sitting on the block step loses on time, not the attacker (#248)", async () => {
    const room = await colyseus.createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed: 42,
      autoSkipMulligan: true,
      timer: { matchSeconds: 900 },
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
    const clients = [c0, c1] as const;

    // Pass turns (answering any prompt) until the active seat can attack, then attack the leader.
    for (let i = 0; i < 40; i++) {
      const m = internals(room).match;
      if (m.phase === "block" || m.phase === "counter") break;
      const seat = ([0, 1] as const).find((s) => bags[s].views.at(-1)!.legalIntents.length > 0);
      assert.ok(seat !== undefined, "someone can act");
      const legal = bags[seat].views.at(-1)!.legalIntents;
      const pick =
        legal.find((x) => x.type === "declare_attack" && (x.target as { kind: string }).kind === "leader") ??
        legal.find((x) => x.type === "end_turn") ??
        legal[0]!;
      const seen: [number, number] = [bags[0].views.length, bags[1].views.length];
      clients[seat].send("intent", { protocolVersion: PROTOCOL_VERSION, intent: pick });
      await waitUntil(() => bags[0].views.length > seen[0] && bags[1].views.length > seen[1], 5000);
    }
    const m = internals(room).match;
    assert.equal(m.phase, "block");
    assert.equal(m.pendingChoices.length, 0);
    const attacker = m.activeSeat;
    assert.equal(m.battle!.attackerSeat, attacker);

    // The defender never passes the block step.
    internals(room).matchEndsAt = Date.now() - 1;
    await waitUntil(() => bags[0].over != null, 5000);
    assert.deepEqual(bags[0].over!.result, { winner: attacker, reason: "match_timeout" });

    await c0.leave(true);
    await c1.leave(true);
  });

  it("refuses to create a room without a game token when tokens are required (#318)", async () => {
    // The matchmake HTTP call itself (what the SDK sends before opening the socket) must fail:
    // a room created here would hold seat reservations even though the socket join is refused later.
    const http = { token: "", headers: new Headers(), ip: "127.0.0.1" } as unknown as Parameters<typeof matchMaker.create>[2];
    await withTokensRequired(async () => {
      await assert.rejects(() => matchMaker.create("duel", { protocolVersion: PROTOCOL_VERSION }, http), /gameToken required/);
      await assert.rejects(() => matchMaker.joinOrCreate("ranked_queue", { protocolVersion: PROTOCOL_VERSION }, http), /gameToken required/);
    });
    assert.equal((await matchMaker.query({ name: "duel" })).length, 0);
  });

  it("duel rooms can only be joined by id, never by an id-less matchmake join (#318)", async () => {
    const host = await colyseus.sdk.create("duel", { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(501) });
    await assert.rejects(() => colyseus.sdk.join("duel", { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(502) }));
    const guest = await colyseus.sdk.joinById(host.roomId, { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(502) });
    assert.equal(guest.roomId, host.roomId);
    await guest.leave(true);
    await host.leave(true);
  });

  it("caps how many open rooms one account can create (#318)", async () => {
    const opts = { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(601) };
    const rooms = await withTokensRequired(async () => {
      const made = [];
      for (let i = 0; i < MAX_ROOMS_PER_CREATOR; i++) made.push(await colyseus.sdk.create("duel", opts));
      await assert.rejects(() => colyseus.sdk.create("duel", opts), /Too many open rooms/);
      assert.equal((await matchMaker.query({ name: "duel" })).length, MAX_ROOMS_PER_CREATOR);
      // Another account is not affected.
      made.push(await colyseus.sdk.create("duel", { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(602) }));
      return made;
    });
    for (const r of rooms) await r.leave(true);
  });

  it("a rejected room create doesn't use up one of the account's room slots (#318)", async () => {
    const badDeck = { leaderId: "ZZ99-001", deck: Array.from({ length: 50 }, () => "ST01-003") };
    const opts = { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(611) };
    const room = await withTokensRequired(async () => {
      for (let i = 0; i < MAX_ROOMS_PER_CREATOR; i++) {
        // Each create is turned away by onCreate ("Deck rejected: Unknown or invalid leader").
        await assert.rejects(() => colyseus.sdk.create("duel", { ...opts, players: [badDeck, badDeck] }));
      }
      assert.equal((await matchMaker.query({ name: "duel" })).length, 0);
      return colyseus.sdk.create("duel", opts);
    });
    await room.leave(true);
  });

  it("drops a client that floods the room with messages (#318)", async () => {
    const room = await colyseus.sdk.create("duel", { protocolVersion: PROTOCOL_VERSION, gameToken: gameToken(701) });
    let pongs = 0;
    room.onMessage("pong", () => {
      pongs++;
    });
    for (let i = 0; i < 100; i++) room.send("ping", { t: i });
    await new Promise((r) => setTimeout(r, 1000));
    // The server stops answering once the client passes the per-second cap and is cut off.
    assert.ok(pongs < 100, `answered ${pongs} of 100 pings`);
    assert.equal(colyseus.getRoomById(room.roomId)?.clients.length ?? 0, 0);
  });
});
