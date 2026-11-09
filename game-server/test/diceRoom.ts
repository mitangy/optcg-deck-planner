import assert from "node:assert/strict";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { createHmac } from "node:crypto";
import { buildTestDeck, DEFAULT_LEADER_ID } from "@optcg/rules";
import { getGameTokenSecret } from "../src/env.js";
import { DICE_STEP_SECONDS, PROTOCOL_VERSION } from "../src/protocol.js";
import { botPacing, type DuelRoom } from "../src/rooms/DuelRoom.js";
import { withFakeTime } from "./fakeTime.js";
import { withRoomEnv } from "./roomEnv.js";

type Dice = {
  roller: 0 | 1;
  caller: 0 | 1;
  step: "call" | "roll" | "choose" | "done" | "cancelled";
  call: "high" | "low" | null;
  roll: number | null;
  winner: 0 | 1 | null;
  deadline: number | null;
  seat: 0 | 1;
  role: "player" | "spectator";
  players?: { name: string | null }[];
};
type Welcome = {
  seat: 0 | 1;
  firstSeatPickedBy?: 0 | 1 | null;
  dice?: { roller: number; caller: number; call: string; roll: number; winner: number } | null;
  view: { firstSeat?: 0 | 1; phase: string };
};
type Bag = { dice: Dice[]; welcomes: Welcome[]; errors: { code: string; message: string }[] };

const fast = { mainMs: 10, choiceMs: 10 };
const msg = (extra: object) => ({ protocolVersion: PROTOCOL_VERSION, ...extra });
const join = (devUserId: string, preferredSeat?: 0 | 1, extra: object = {}) => msg({ devUserId, preferredSeat, ...extra });

function attach(client: ClientRoom): Bag {
  const bag: Bag = { dice: [], welcomes: [], errors: [] };
  client.onMessage("dice_state", (m: Dice) => bag.dice.push(m));
  client.onMessage("welcome", (m: Welcome) => bag.welcomes.push(m));
  client.onMessage("error", (m: { code: string; message: string }) => bag.errors.push(m));
  // The first messages may have been sent before the listeners existed: ask for the state again.
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

function gameToken(uid: number): string {
  const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const body = b64url(Buffer.from(JSON.stringify({ uid, email: `u${uid}@x.com`, exp: Math.floor(Date.now() / 1000) + 600 })));
  return `${body}.${b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest())}`;
}

/** Scripts the room's dice: each draw takes the next value (the roller seat, then calls, then die faces minus one). */
function script(room: DuelRoom, values: number[]) {
  const queue = [...values];
  room.dice.randomInt = () => {
    const v = queue.shift();
    if (v === undefined) throw new Error("dice script ran out");
    return v;
  };
}

/** The opening dice roll (#1190). */
export function diceRoomTests(getServer: () => ColyseusTestServer) {
  describe("opening dice roll (#1190)", () => {
    const saved = { ...botPacing };
    beforeEach(() => Object.assign(botPacing, fast));
    afterEach(() => Object.assign(botPacing, saved));

    const create = (opts: object = {}) =>
      getServer().createRoom<DuelRoom>("duel", {
        protocolVersion: PROTOCOL_VERSION,
        seed: 51,
        firstSeat: 0,
        autoSkipMulligan: true,
        diceRoll: true,
        ...opts,
      });

    /** Two players seated; `values` script the dice. Seat 0 joins first, so the dice start on seat 1's join. */
    async function seated(values: number[], opts: object = {}) {
      const room = await create(opts);
      script(room, values);
      const c0 = await getServer().connectTo(room, join("alice", 0));
      const c1 = await getServer().connectTo(room, join("bob", 1));
      const [b0, b1] = [attach(c0), attach(c1)];
      await waitUntil(() => b0.dice.length > 0 && b1.dice.length > 0);
      return { room, c: [c0, c1] as const, b: [b0, b1] as const };
    }

    const last = (bag: Bag) => bag.dice.at(-1)!;

    it("seat 0 rolls and seat 1 calls: call, roll, then the winner chooses, and the game starts with the winner as chooser", async () => {
      // roller 0; the roll draws 4 (a 5); the caller called High.
      const { room, c, b } = await seated([0, 4]);
      for (const bag of b) {
        assert.equal(last(bag).step, "call");
        assert.equal(last(bag).roller, 0);
        assert.equal(last(bag).caller, 1);
        assert.deepEqual(last(bag).players, [{ name: "alice" }, { name: "bob" }]);
        assert.equal(bag.welcomes.length, 0, "no game before the dice are done");
      }
      assert.equal(b[0].dice[0]!.seat, 0);
      assert.equal(b[1].dice[0]!.seat, 1);
      assert.ok(room.game.matchStarted === false);

      c[1].send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => last(b[0]).step === "roll" && last(b[1]).step === "roll");
      assert.equal(last(b[0]).call, "high");

      c[0].send("dice", msg({ action: "roll" }));
      await waitUntil(() => last(b[0]).step === "choose" && last(b[1]).step === "choose");
      assert.equal(last(b[1]).roll, 5);
      assert.equal(last(b[1]).winner, 1, "High called, a 5 rolled: the caller wins");

      c[1].send("dice", msg({ action: "second" }));
      await waitUntil(() => b[0].welcomes.length > 0 && b[1].welcomes.length > 0);
      assert.equal(last(b[0]).step, "done");
      for (const bag of b) {
        const w = bag.welcomes[0]!;
        assert.equal(w.firstSeatPickedBy, 1);
        assert.deepEqual(w.dice, { roller: 0, caller: 1, call: "high", roll: 5, winner: 1 });
        assert.equal(w.view.firstSeat, 0, "the winner chose to go second");
      }
      assert.deepEqual([...b[0].errors, ...b[1].errors], []);
    });

    // [call, die face, who wins]: the boundaries 3/4 and both sides of each call.
    const outcomes: [string, number, "caller" | "roller"][] = [
      ["high", 5, "caller"],
      ["high", 4, "caller"],
      ["high", 3, "roller"],
      ["high", 2, "roller"],
      ["low", 3, "caller"],
      ["low", 1, "caller"],
      ["low", 4, "roller"],
      ["low", 6, "roller"],
    ];
    for (const [call, face, who] of outcomes) {
      it(`call ${call} and a ${face} is won by the ${who}`, async () => {
        const { c, b } = await seated([0, face - 1]);
        c[1].send("dice", msg({ action: "call", call }));
        await waitUntil(() => last(b[0]).step === "roll");
        c[0].send("dice", msg({ action: "roll" }));
        await waitUntil(() => last(b[0]).step === "choose");
        assert.equal(last(b[0]).roll, face);
        assert.equal(last(b[0]).winner, who === "caller" ? 1 : 0);
        assert.equal(last(b[1]).winner, who === "caller" ? 1 : 0);
      });
    }

    it("the loser of the roll never chooses, and the winner's pick decides the order", async () => {
      // High + a 2: the roller (seat 0) wins and takes first.
      const { c, b } = await seated([0, 1]);
      c[1].send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => last(b[0]).step === "roll");
      c[0].send("dice", msg({ action: "roll" }));
      await waitUntil(() => last(b[0]).step === "choose");
      c[1].send("dice", msg({ action: "first" }));
      await waitUntil(() => b[1].errors.length > 0);
      assert.equal(b[1].errors.at(-1)!.code, "unauthorized");
      assert.equal(last(b[0]).step, "choose");
      c[0].send("dice", msg({ action: "first" }));
      await waitUntil(() => b[0].welcomes.length > 0);
      assert.equal(b[0].welcomes[0]!.view.firstSeat, 0);
      assert.equal(b[0].welcomes[0]!.firstSeatPickedBy, 0);
    });

    it("the wrong seat is told unauthorized and the wrong step match_not_ready, and neither moves the roll", async () => {
      const { room, c, b } = await seated([0, 4]);
      // Step "call": the roller may not call (wrong seat) and nobody may roll or choose yet (wrong step).
      c[0].send("dice", msg({ action: "call", call: "low" }));
      await waitUntil(() => b[0].errors.length === 1);
      assert.equal(b[0].errors[0]!.code, "unauthorized");
      c[1].send("dice", msg({ action: "roll" }));
      c[1].send("dice", msg({ action: "first" }));
      await waitUntil(() => b[1].errors.length === 2);
      assert.deepEqual(b[1].errors.map((e) => e.code), ["match_not_ready", "match_not_ready"]);
      assert.equal(last(b[0]).step, "call");
      assert.equal(last(b[0]).call, null);

      c[1].send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => last(b[1]).step === "roll");
      // Step "roll": the caller may not roll, and a second call is the wrong step.
      c[1].send("dice", msg({ action: "roll" }));
      c[1].send("dice", msg({ action: "call", call: "low" }));
      await waitUntil(() => b[1].errors.length === 4);
      assert.deepEqual(b[1].errors.slice(2).map((e) => e.code), ["unauthorized", "match_not_ready"]);
      assert.equal(last(b[0]).call, "high", "the first call stands");
      assert.equal(last(b[0]).roll, null);
      assert.equal(room.game.matchStarted, false);
    });

    it("rejects a malformed dice message", async () => {
      const { c, b } = await seated([0, 4]);
      c[1].send("dice", msg({ action: "call", call: "middle" }));
      c[1].send("dice", msg({ action: "juggle" }));
      await waitUntil(() => b[1].errors.length === 2);
      assert.deepEqual(b[1].errors.map((e) => e.code), ["bad_protocol", "bad_protocol"]);
    });

    it("a spectator watches the same steps, with the camera seat, and cannot act", async () => {
      const { room, c, b } = await seated([0, 4]);
      const spec = await getServer().connectTo(room, join("watcher", 0, { role: "spectator" }));
      const sb = attach(spec);
      await waitUntil(() => sb.dice.length > 0);
      assert.equal(last(sb).role, "spectator");
      assert.equal(last(sb).step, "call");
      assert.deepEqual(last(sb).players, [{ name: "alice" }, { name: "bob" }]);

      spec.send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => sb.errors.length === 1);
      assert.equal(sb.errors[0]!.code, "unauthorized");

      c[1].send("dice", msg({ action: "call", call: "low" }));
      await waitUntil(() => last(sb).step === "roll");
      assert.equal(last(sb).call, "low");
      assert.equal(b[0].welcomes.length, 0);
    });

    it("a client that asks to sync mid-roll is shown the current step, not an error", async () => {
      const { c, b } = await seated([0, 4]);
      c[1].send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => last(b[0]).step === "roll");
      const before = b[0].dice.length;
      c[0].send("sync", msg({}));
      await waitUntil(() => b[0].dice.length > before);
      assert.equal(last(b[0]).step, "roll");
      assert.equal(last(b[0]).call, "high");
      assert.deepEqual(b[0].errors, []);
    });

    it("a step nobody answers is played by the server: a call, then the roll, then First for the winner", () =>
      withFakeTime(async (time) => {
        // roller 0; the server calls Low (draw 1 of 2); it then rolls 2 (a 3 from draw 2): Low wins for the caller (seat 1).
        const { room, b } = await seated([0, 1, 2]);
        const first = last(b[0]);
        assert.equal(first.deadline, time.now() + DICE_STEP_SECONDS * 1000);
        await time.advance(DICE_STEP_SECONDS * 1000 - 1);
        assert.equal(last(b[0]).step, "call", "not before the limit");
        await time.advance(1);
        await waitUntil(() => last(b[0]).step === "roll");
        assert.equal(last(b[0]).call, "low");
        assert.equal(last(b[0]).deadline, time.now() + DICE_STEP_SECONDS * 1000, "each step gets a fresh limit");
        await time.advance(DICE_STEP_SECONDS * 1000);
        await waitUntil(() => last(b[0]).step === "choose");
        assert.equal(last(b[0]).roll, 3);
        assert.equal(last(b[0]).winner, 1);
        await time.advance(DICE_STEP_SECONDS * 1000);
        await waitUntil(() => b[0].welcomes.length > 0 && b[1].welcomes.length > 0);
        assert.equal(b[1].welcomes[0]!.view.firstSeat, 1, "the winner goes first when the server chooses");
        assert.equal(room.game.firstSeatPickedBy, 1);
      }));

    it("the roller comes from the room's seed on a local server: the same seed repeats, and both seats get to roll", async () => {
      const rollerFor = async (seed: number) => {
        const room = await create({ seed });
        const c0 = await getServer().connectTo(room, join("alice", 0));
        const b0 = attach(c0);
        await getServer().connectTo(room, join("bob", 1));
        await waitUntil(() => b0.dice.length > 0);
        return last(b0).roller;
      };
      assert.equal(await rollerFor(77), await rollerFor(77));
      const rollers = new Set<number>();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) rollers.add(await rollerFor(seed));
      assert.equal(rollers.size, 2);
    });

    it("a seat that leaves mid-roll ends it; the seat that stays is told, and a fresh roll starts when the room fills again", () =>
      withFakeTime(async (time) => {
        const { room, c, b } = await seated([0, 4]);
        c[1].send("dice", msg({ action: "call", call: "high" }));
        await waitUntil(() => last(b[0]).step === "roll");
        await c[1].leave(true);
        await waitUntil(() => last(b[0]).step === "cancelled");
        assert.equal(room.dice.active, false);
        // Nothing the old roll queued fires.
        await time.advance(DICE_STEP_SECONDS * 1000 * 2);
        assert.equal(room.game.matchStarted, false);
        assert.equal(b[0].welcomes.length, 0);

        script(room, [1]);
        const again = await getServer().connectTo(room, join("carol", 1));
        const ab = attach(again);
        await waitUntil(() => last(b[0]).step === "call" && ab.dice.length > 0);
        assert.equal(last(b[0]).roller, 1, "a fresh roll picks its own roller");
        assert.equal(last(b[0]).call, null);
        assert.deepEqual(last(ab).players, [{ name: "alice" }, { name: "carol" }]);
      }));

    it("a room that did not ask for the dice starts at once with a coin flip", async () => {
      const room = await create({ diceRoll: undefined });
      const c0 = await getServer().connectTo(room, join("alice", 0));
      const b0 = attach(c0);
      await getServer().connectTo(room, join("bob", 1));
      c0.send("sync", msg({}));
      await waitUntil(() => b0.welcomes.length > 0);
      assert.equal(b0.dice.length, 0);
      assert.equal(b0.welcomes.at(-1)!.firstSeatPickedBy, null);
      assert.equal(b0.welcomes.at(-1)!.dice, null);
    });

    it("a deployed server (game tokens required) rolls the dice without being asked", () =>
      withRoomEnv({ requireGameToken: true }, async () => {
        const room = await create({ diceRoll: undefined });
        const c0 = await getServer().connectTo(room, msg({ gameToken: gameToken(901), preferredSeat: 0 }));
        const b0 = attach(c0);
        await getServer().connectTo(room, msg({ gameToken: gameToken(902), preferredSeat: 1 }));
        await waitUntil(() => b0.dice.length > 0);
        assert.equal(last(b0).step, "call");
        assert.equal(b0.welcomes.length, 0);
      }));

    it("a practice game (one account on both seats) keeps the coin flip", () =>
      withRoomEnv({}, async () => {
        const room = await create();
        const owner = { ownerToken: gameToken(910) };
        const c0 = await getServer().connectTo(room, msg({ gameToken: gameToken(911), preferredSeat: 0, ...owner }));
        const b0 = attach(c0);
        await getServer().connectTo(room, msg({ gameToken: gameToken(912), preferredSeat: 1, ...owner }));
        c0.send("sync", msg({}));
        await waitUntil(() => b0.welcomes.length > 0);
        assert.equal(b0.dice.length, 0);
        assert.equal(b0.welcomes.at(-1)!.firstSeatPickedBy, null);
      }));

    it("a paired room's no-show timer does not close a room that is mid-roll", () =>
      withFakeTime(async (time) =>
        withRoomEnv({ requireGameToken: true, rankedNoShowSeconds: 5 }, async () => {
          const room = await create({ diceRoll: undefined, seatUserIds: [921, 922] });
          const c0 = await getServer().connectTo(room, msg({ gameToken: gameToken(921), preferredSeat: 0 }));
          const c1 = await getServer().connectTo(room, msg({ gameToken: gameToken(922), preferredSeat: 1 }));
          const [b0, b1] = [attach(c0), attach(c1)];
          await waitUntil(() => b0.dice.length > 0 && b1.dice.length > 0);
          await time.advance(6000);
          assert.deepEqual([...b0.errors, ...b1.errors], []);
          assert.equal(room.dice.active, true);
        }),
      ));

    it("a rematch does not roll the dice: the loser chooses and the welcome carries no dice", async () => {
      const { c, b } = await seated([0, 4]);
      c[1].send("dice", msg({ action: "call", call: "high" }));
      await waitUntil(() => last(b[0]).step === "roll");
      c[0].send("dice", msg({ action: "roll" }));
      await waitUntil(() => last(b[0]).step === "choose");
      c[1].send("dice", msg({ action: "first" }));
      await waitUntil(() => b[0].welcomes.length > 0);
      assert.ok(b[0].welcomes[0]!.dice);

      const rematch: { available: boolean; chooser: number | null }[] = [];
      c[0].onMessage("rematch_state", (m: (typeof rematch)[number]) => rematch.push(m));
      c[0].send("concede", msg({}));
      await waitUntil(() => rematch.some((r) => r.available));
      const seenDice = b[0].dice.length;
      c[0].send("rematch", msg({ action: "request" }));
      c[1].send("rematch", msg({ action: "request" }));
      await waitUntil(() => rematch.at(-1)!.chooser === 0);
      c[0].send("rematch", msg({ action: "second" }));
      await waitUntil(() => b[0].welcomes.length > 1);
      const w = b[0].welcomes.at(-1)!;
      assert.equal(w.firstSeatPickedBy, 0);
      assert.equal(w.dice ?? null, null, "the rematch's welcome does not repeat game 1's roll");
      assert.equal(b[0].dice.length, seenDice, "no new dice steps");
    });

    describe("bot rooms", () => {
      const createBot = () =>
        create({ bot: { level: "normal", deck: { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) } } });

      it("the bot calls, rolls and picks First on its own when it is the caller", () =>
        withFakeTime(async (time) => {
          const room = await createBot();
          // roller 0 (the human), the bot calls Low (draw 1), the human's roll is a 2: the bot wins and goes first.
          script(room, [0, 1, 1]);
          const human = await getServer().connectTo(room, join("human", 0));
          const hb = attach(human);
          await waitUntil(() => hb.dice.length > 0);
          assert.equal(last(hb).caller, 1);
          await time.advance(botPacing.choiceMs);
          await waitUntil(() => last(hb).step === "roll");
          assert.equal(last(hb).call, "low");
          human.send("dice", msg({ action: "roll" }));
          await waitUntil(() => last(hb).step === "choose");
          assert.equal(last(hb).roll, 2);
          assert.equal(last(hb).winner, 1);
          await time.advance(botPacing.choiceMs + 5000);
          await waitUntil(() => hb.welcomes.length > 0);
          assert.equal(hb.welcomes[0]!.view.firstSeat, 1);
          assert.equal(hb.welcomes[0]!.firstSeatPickedBy, 1);
          assert.equal(hb.welcomes[0]!.dice!.winner, 1);
        }));

      it("the bot rolls when it is the roller, after the human's call", () =>
        withFakeTime(async (time) => {
          const room = await createBot();
          // roller 1 (the bot); the human calls High; the bot's roll is a 6: High wins for the human.
          script(room, [1, 5]);
          const human = await getServer().connectTo(room, join("human", 0));
          const hb = attach(human);
          await waitUntil(() => hb.dice.length > 0);
          assert.equal(last(hb).roller, 1);
          human.send("dice", msg({ action: "call", call: "high" }));
          await waitUntil(() => last(hb).step === "roll");
          await time.advance(botPacing.choiceMs);
          await waitUntil(() => last(hb).step === "choose");
          assert.equal(last(hb).roll, 6);
          assert.equal(last(hb).winner, 0, "the human won, so the bot does not choose");
          await time.advance(10_000);
          assert.equal(last(hb).step, "choose");
          assert.equal(hb.welcomes.length, 0);
        }));
    });
  });
}
