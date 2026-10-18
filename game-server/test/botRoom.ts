import assert from "node:assert/strict";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { createHmac } from "node:crypto";
import { buildTestDeck, DEFAULT_LEADER_ID, type MatchReplay, type MatchState } from "@optcg/rules";
import { getGameTokenSecret, getRankedMatchCreateSecret } from "../src/env.js";
import { PROTOCOL_VERSION } from "../src/protocol.js";
import { botPacing, type DuelRoom } from "../src/rooms/DuelRoom.js";
import type { MatchProgressPayload, MatchResultPayload } from "../src/writeback.js";

type View = {
  seat: 0 | 1;
  phase: string;
  winner: 0 | 1 | null;
  activeSeat: 0 | 1;
  you: { mulliganDone: boolean };
  legalIntents: (Record<string, unknown> & { type: string })[];
};
type Bag = {
  welcomes: { seat: number; view: View; ranked?: boolean; bot?: { level: string }; players?: { name: string | null }[] }[];
  views: View[];
  errors: { code: string; message: string }[];
  undoApplied: { by: number }[];
  rematch: { requested: [boolean, boolean]; chooser: number | null }[];
  over?: { result: { winner: 0 | 1; reason: string } };
};

const botDeck = () => ({ leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) });
const fast = { mainMs: 10, choiceMs: 10 };

function join(devUserId: string, preferredSeat?: 0 | 1, extra: object = {}) {
  return { protocolVersion: PROTOCOL_VERSION, devUserId, preferredSeat, ...extra };
}

function attach(client: ClientRoom): Bag {
  const bag: Bag = { welcomes: [], views: [], errors: [], undoApplied: [], rematch: [] };
  client.onMessage("welcome", (m: Bag["welcomes"][number]) => {
    bag.welcomes.push(m);
    bag.views.push(m.view);
  });
  client.onMessage("view", (m: { view: View }) => bag.views.push(m.view));
  client.onMessage("error", (m: { code: string; message: string }) => bag.errors.push(m));
  client.onMessage("undo_applied", (m: { by: number }) => bag.undoApplied.push(m));
  client.onMessage("rematch_state", (m: Bag["rematch"][number]) => bag.rematch.push(m));
  client.onMessage("match_over", (m: { result: { winner: 0 | 1; reason: string } }) => {
    bag.over = m;
  });
  // The welcome may have been sent before the listeners existed: ask for it again.
  client.send("sync", { protocolVersion: PROTOCOL_VERSION });
  return bag;
}

async function waitUntil(pred: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

const humanSend = (c: ClientRoom, intent: object) => c.send("intent", { protocolVersion: PROTOCOL_VERSION, intent });
const last = (bag: Bag) => bag.views.at(-1)!;
type Internals = { match: MatchState; replay: MatchReplay | null };
const internals = (room: DuelRoom) => room as unknown as Internals;

function gameToken(uid: number): string {
  const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const body = b64url(Buffer.from(JSON.stringify({ uid, email: `u${uid}@x.com`, exp: Math.floor(Date.now() / 1000) + 600 })));
  return `${body}.${b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest())}`;
}

/** "Play vs Bot" rooms (#631): seat 1 is the server's bot. */
export function botRoomTests(getServer: () => ColyseusTestServer) {
  describe("bot rooms", () => {
    const saved = { ...botPacing };
    beforeEach(() => Object.assign(botPacing, fast));
    afterEach(() => Object.assign(botPacing, saved));

    const create = (opts: object = {}) =>
      getServer().createRoom<DuelRoom>("duel", {
        protocolVersion: PROTOCOL_VERSION,
        seed: 31,
        firstSeat: 0,
        bot: { level: "normal", deck: botDeck() },
        ...opts,
      });

    it("the bot answers its mulligan and takes its turn while the human plays on (#631)", async () => {
      const room = await create({ autoSkipMulligan: false });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      assert.equal(bag.welcomes[0]!.seat, 0);
      assert.deepEqual(bag.welcomes[0]!.bot, { level: "normal" });
      assert.deepEqual(bag.welcomes[0]!.players, [{ name: "human" }, { name: "Bot (Normal)" }]);
      assert.equal(last(bag).phase, "mulligan");

      // The human keeps first; only then can the bot's mulligan be asked, and the bot answers it unprompted.
      humanSend(human, { type: "mulligan", doMulligan: false });
      await waitUntil(() => last(bag).phase === "main");
      assert.equal(last(bag).activeSeat, 0);
      assert.ok(internals(room).match.players[1].mulliganDone, "the bot answered its mulligan");

      // Ending the human's turn hands the game to the bot, which plays and gives it back.
      humanSend(human, { type: "end_turn" });
      await waitUntil(() => internals(room).match.turnNumber >= 3 && last(bag).activeSeat === 0 && last(bag).legalIntents.length > 0);
      assert.ok(internals(room).replay!.intents.filter((i) => i.seat === 1).length > 1, "the bot played its turn");
      assert.deepEqual(bag.errors, []);
    });

    it("the bot plays the first turn by itself when it wins the coin flip (#631)", async () => {
      const room = await create({ firstSeat: 1, autoSkipMulligan: true });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      await waitUntil(() => last(bag).activeSeat === 0 && last(bag).phase === "main" && last(bag).legalIntents.length > 0);
      assert.ok(internals(room).replay!.intents.length > 0, "the bot acted before the human could");
      assert.ok(internals(room).replay!.intents.every((i) => i.seat === 1));
      assert.deepEqual(bag.errors, []);
    });

    it("nobody can take the bot's seat: a lone human lands in seat 0 and a second player is turned away (#631)", async () => {
      const room = await create();
      const human = await getServer().connectTo(room, join("human", 1));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      assert.equal(bag.welcomes[0]!.seat, 0);

      await assert.rejects(() => getServer().connectTo(room, join("intruder", 1)));
      await assert.rejects(() => getServer().connectTo(room, join("intruder")));
      assert.deepEqual(bag.errors, []);
    });

    it("a bot room is never ranked, even when the create options carry a ranked attestation (#631)", async () => {
      const room = await create({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      assert.equal(bag.welcomes[0]!.ranked, false);
    });

    it("a bot game is not written to match history, even for a signed-in player (#631)", async () => {
      const prev = process.env.MATCH_OUTBOX_DATABASE_URL;
      process.env.MATCH_OUTBOX_DATABASE_URL = "postgres://outbox.invalid/db";
      try {
        const room = await create();
        const sent: unknown[] = [];
        Object.assign(room, {
          persistMatchProgress: async (_id: string, p: MatchProgressPayload) => void sent.push(p),
          persistMatchResult: async (p: MatchResultPayload) => void sent.push(p),
        });
        const human = await getServer().connectTo(room, join("ignored", 0, { gameToken: gameToken(777) }));
        const bag = attach(human);
        await waitUntil(() => bag.welcomes.length > 0);
        humanSend(human, { type: "end_turn" });
        await waitUntil(() => internals(room).match.turnNumber >= 3);
        human.send("concede", { protocolVersion: PROTOCOL_VERSION });
        await waitUntil(() => bag.over !== undefined);
        assert.equal(bag.over!.result.winner, 1);
        assert.deepEqual(sent, []);
      } finally {
        if (prev === undefined) delete process.env.MATCH_OUTBOX_DATABASE_URL;
        else process.env.MATCH_OUTBOX_DATABASE_URL = prev;
      }
    });

    it("the bot accepts the human's undo request (#631)", async () => {
      const room = await create({ autoSkipMulligan: true });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      humanSend(human, { type: "end_turn" });
      await waitUntil(() => last(bag).activeSeat === 0 && internals(room).match.turnNumber >= 3);
      human.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request", scope: "action", force: true });
      await waitUntil(() => bag.undoApplied.length > 0);
      assert.equal(bag.undoApplied[0]!.by, 0);
    });

    it("the bot agrees to a rematch as soon as the human asks (#631)", async () => {
      const room = await create({ autoSkipMulligan: true });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      human.send("concede", { protocolVersion: PROTOCOL_VERSION });
      await waitUntil(() => bag.over !== undefined);
      human.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "request" });
      await waitUntil(() => bag.rematch.some((r) => r.requested[0] && r.requested[1]));
      // The conceding human lost, so they pick the turn order.
      human.send("rematch", { protocolVersion: PROTOCOL_VERSION, action: "first" });
      await waitUntil(() => bag.welcomes.length > 1);
      assert.equal(last(bag).winner, null);
      assert.deepEqual(bag.errors, []);
    });

    it("a bot whose own answer is rejected plays a legal move instead of conceding (#631)", async () => {
      const room = await create({ autoSkipMulligan: false });
      type Patchable = { applySeatIntent(seat: number, intent: unknown): { ok: boolean; message?: string } };
      const original = (room as unknown as Patchable).applySeatIntent.bind(room);
      let rejected = 0;
      // The bot's first answer (its mulligan) is turned away once, like a rejected pick on a prompt.
      Object.assign(room, {
        applySeatIntent: (seat: number, intent: unknown) => {
          if (seat === 1 && rejected === 0) {
            rejected += 1;
            return { ok: false, message: "rejected" };
          }
          return original(seat, intent);
        },
      });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.welcomes.length > 0);
      humanSend(human, { type: "mulligan", doMulligan: false });
      await waitUntil(() => internals(room).match.players[1].mulliganDone || bag.over !== undefined);
      assert.equal(rejected, 1);
      assert.equal(bag.over, undefined, "the bot did not give the game up");
      assert.ok(internals(room).match.players[1].mulliganDone, "the bot answered its mulligan with a legal move");
    });

    it("a bot that cannot make a legal move concedes instead of freezing the game (#631)", async () => {
      const room = await create({ firstSeat: 1, autoSkipMulligan: true });
      type Patchable = { applySeatIntent(seat: number, intent: unknown): { ok: boolean; message?: string } };
      const original = (room as unknown as Patchable).applySeatIntent.bind(room);
      Object.assign(room, {
        applySeatIntent: (seat: number, intent: unknown) =>
          seat === 1 ? { ok: false, message: "rejected" } : original(seat, intent),
      });
      const human = await getServer().connectTo(room, join("human", 0));
      const bag = attach(human);
      await waitUntil(() => bag.over !== undefined);
      assert.equal(bag.over!.result.winner, 0);
    });
  });
}
