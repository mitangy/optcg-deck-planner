import assert from "node:assert/strict";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "../src/protocol.js";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";

type View = { activeSeat: 0 | 1; you: { hand: { id: string; defId: string }[] } };
type Bag = { views: { view: View; step?: number }[]; errors: { code: string; message: string }[] };

async function waitUntil(pred: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

const pause = () => new Promise((r) => setTimeout(r, 60));

export function staleIntentTests(getColyseus: () => ColyseusTestServer) {
  async function setup(seed: number) {
    const room = await getColyseus().createRoom<DuelRoom>("duel", {
      protocolVersion: PROTOCOL_VERSION,
      seed,
      autoSkipMulligan: true,
    });
    const bags: [Bag, Bag] = [
      { views: [], errors: [] },
      { views: [], errors: [] },
    ];
    const clients: ClientRoom[] = [];
    for (const seat of [0, 1] as const) {
      const c = await getColyseus().connectTo(room, { protocolVersion: PROTOCOL_VERSION, devUserId: `stale${seat}`, preferredSeat: seat });
      c.onMessage("view", (m: { view: View; step?: number }) => bags[seat].views.push(m));
      c.onMessage("error", (m: { code: string; message: string }) => bags[seat].errors.push(m));
      clients.push(c);
    }
    for (const c of clients) c.send("sync", { protocolVersion: PROTOCOL_VERSION });
    await waitUntil(() => bags[0].views.length > 0 && bags[1].views.length > 0);
    const active = bags[0].views.at(-1)!.view.activeSeat;
    const other = (1 - active) as 0 | 1;
    const send = (seat: 0 | 1, intent: object, guards: object = {}) =>
      clients[seat]!.send("intent", { protocolVersion: PROTOCOL_VERSION, intent, ...guards });
    const stepOf = (seat: 0 | 1) => bags[seat].views.at(-1)!.step!;
    const match = () => room.game.match!;
    return { room, bags, clients, active, other, send, stepOf, match };
  }

  describe("stale intents (#1351)", () => {
    it("views carry the server step (#1351)", async () => {
      const t = await setup(31);
      assert.equal(t.stepOf(t.active), t.room.game.stateStep);
    });

    it("an intent with an old step is not applied; the sender gets a fresh view and stale_intent (#1351)", async () => {
      const t = await setup(31);
      const old = t.stepOf(t.active);
      t.send(t.active, { type: "end_turn" }, { step: old });
      await waitUntil(() => t.match().activeSeat === t.other);
      await waitUntil(() => t.stepOf(t.other) > old);
      const fresh = t.stepOf(t.other);
      const viewsBefore = t.bags[t.other].views.length;
      t.send(t.other, { type: "end_turn" }, { step: old });
      await waitUntil(() => t.bags[t.other].errors.some((e) => e.code === "stale_intent"));
      assert.equal(t.match().activeSeat, t.other, "stale end_turn must not run");
      await waitUntil(() => t.bags[t.other].views.length > viewsBefore);
      assert.equal(t.stepOf(t.other), fresh);
      assert.ok(!t.bags[t.other].errors.some((e) => e.code === "illegal_intent"));
    });

    it("an intent with the current step applies (#1351)", async () => {
      const t = await setup(31);
      t.send(t.active, { type: "end_turn" }, { step: t.stepOf(t.active) });
      await waitUntil(() => t.match().activeSeat === t.other);
      assert.deepEqual(t.bags[t.active].errors, []);
    });

    it("an intent without a step applies, as older clients send (#1351)", async () => {
      const t = await setup(31);
      t.send(t.active, { type: "end_turn" });
      await waitUntil(() => t.match().activeSeat === t.other);
      t.send(t.other, { type: "end_turn" });
      await waitUntil(() => t.match().activeSeat === t.active);
      assert.deepEqual(t.bags[t.other].errors, []);
    });

    it("a hand intent whose card left the hand is rejected, not applied to the card now at that index (#1351)", async () => {
      const t = await setup(31);
      const hand = t.match().players[t.active].hand.map((c) => c.id);
      const before = t.room.game.replay!.intents.length;
      t.send(t.active, { type: "play_card", handIndex: 0 }, { step: t.stepOf(t.active), cardId: "gone-card" });
      await waitUntil(() => t.bags[t.active].errors.some((e) => e.code === "stale_intent"));
      assert.deepEqual(t.match().players[t.active].hand.map((c) => c.id), hand);
      assert.equal(t.room.game.replay!.intents.length, before);
    });

    it("a hand intent aimed at the wrong index is remapped to the card the player meant (#1351)", async () => {
      const t = await setup(31);
      const p = t.match().players[t.active];
      p.hand[1]!.defId = "OP01-016";
      p.costArea.push(p.donDeck.pop()!);
      const [first, second] = [p.hand[0]!.id, p.hand[1]!.id];
      t.send(t.active, { type: "play_card", handIndex: 0 }, { step: t.stepOf(t.active), cardId: second });
      await waitUntil(() => !t.match().players[t.active].hand.some((c) => c.id === second));
      assert.ok(t.match().players[t.active].hand.some((c) => c.id === first), "the card at the stale index stays in hand");
    });

    it("the step keeps rising across undo, so an in-flight intent from before it stays stale (#1351)", async () => {
      const t = await setup(31);
      const s0 = t.stepOf(t.active);
      t.send(t.active, { type: "end_turn" }, { step: s0 });
      await waitUntil(() => t.match().activeSeat === t.other);
      const s1 = t.room.game.stateStep;
      assert.ok(s1 > s0);
      t.clients[t.other]!.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "request" });
      await waitUntil(() => t.room.undo.request !== null);
      t.clients[t.active]!.send("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept" });
      await waitUntil(() => t.match().activeSeat === t.active);
      assert.ok(t.room.game.stateStep > s1);
      await waitUntil(() => t.stepOf(t.active) === t.room.game.stateStep);
      t.send(t.active, { type: "end_turn" }, { step: s1 });
      await waitUntil(() => t.bags[t.active].errors.some((e) => e.code === "stale_intent"));
      await pause();
      assert.equal(t.match().activeSeat, t.active);
    });
  });
}
