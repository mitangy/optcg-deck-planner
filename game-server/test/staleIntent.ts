import assert from "node:assert/strict";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { getCardDef } from "@optcg/rules";
import { PROTOCOL_VERSION } from "../src/protocol.js";
import type { DuelRoom } from "../src/rooms/DuelRoom.js";

type View = { activeSeat: 0 | 1; legalIntents: { type: string }[]; you: { hand: { id: string; defId: string }[] } };
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

  describe("same-seat intent chains (#1376)", () => {
    const giveAll = (t: Awaited<ReturnType<typeof setup>>, n: number) => {
      const p = t.match().players[t.active];
      while (p.costArea.length < n) p.costArea.push(p.donDeck.pop()!);
      const leader = p.leader.id;
      return p.costArea.slice(0, n).map((d) => ({ type: "give_don", donId: d.id, targetId: leader }));
    };

    it("several DON!! given in one tick with the same step all attach (#1376)", async () => {
      const t = await setup(31);
      const gives = giveAll(t, 3);
      const step = t.stepOf(t.active);
      for (const g of gives) t.send(t.active, g, { step });
      await waitUntil(() => t.match().players[t.active].attachedDons.length === 3 || t.bags[t.active].errors.length > 0);
      await pause();
      assert.deepEqual(t.bags[t.active].errors, []);
      assert.equal(t.match().players[t.active].attachedDons.length, 3);
    });

    it("several counters played from one counter step with the same step all apply (#1376)", async () => {
      const t = await setup(42);
      const send = (seat: 0 | 1, intent: object) => {
        const seen = [t.bags[0].views.length, t.bags[1].views.length];
        t.send(seat, intent, { step: t.stepOf(seat) });
        return waitUntil(() => t.bags[0].views.length > seen[0]! && t.bags[1].views.length > seen[1]!);
      };
      for (let i = 0; i < 40 && t.match().phase !== "block"; i++) {
        const seat = ([0, 1] as const).find((s) => t.bags[s].views.at(-1)!.view.legalIntents.length > 0)!;
        const legal = t.bags[seat].views.at(-1)!.view.legalIntents;
        await send(seat, legal.find((x) => x.type === "declare_attack") ?? legal.find((x) => x.type === "end_turn") ?? legal[0]!);
      }
      assert.equal(t.match().phase, "block");
      const defender = (1 - t.match().activeSeat) as 0 | 1;
      await send(defender, { type: "pass_block" });
      assert.equal(t.match().phase, "counter");
      const p = t.match().players[defender];
      const counterDef = "EB02-055"; // a vanilla Character with a 2000 Counter
      assert.equal(getCardDef(counterDef).counter, 2000);
      p.hand[0]!.defId = counterDef;
      p.hand[1]!.defId = counterDef;
      const [a, b] = [p.hand[0]!.id, p.hand[1]!.id];
      const step = t.stepOf(defender);
      const trashBefore = p.trash.filter((d) => d === counterDef).length;
      t.send(defender, { type: "counter_from_hand", handIndex: 0 }, { step, cardId: a });
      t.send(defender, { type: "counter_from_hand", handIndex: 0 }, { step, cardId: b });
      await waitUntil(() => !t.match().players[defender].hand.some((c) => c.id === a || c.id === b) || t.bags[defender].errors.length > 0);
      await pause();
      assert.deepEqual(t.bags[defender].errors, []);
      assert.equal(t.match().players[defender].trash.filter((d) => d === counterDef).length, trashBefore + 2);
      assert.ok(!t.match().players[defender].hand.some((c) => c.id === a || c.id === b));
    });

    it("another state change between two same-step intents makes the second stale (#1376)", async () => {
      const t = await setup(31);
      const [g1, g2] = giveAll(t, 2);
      const step = t.stepOf(t.active);
      t.send(t.active, g1!, { step });
      await waitUntil(() => t.match().players[t.active].attachedDons.length === 1);
      t.room.game.match = t.match(); // any non-chain change (timer, opponent, undo) moves the step
      t.send(t.active, g2!, { step });
      await waitUntil(() => t.bags[t.active].errors.some((e) => e.code === "stale_intent"));
      assert.equal(t.match().players[t.active].attachedDons.length, 1);
    });

    it("a rejected intent ends the chain: a later same-step intent is stale (#1376)", async () => {
      const t = await setup(31);
      const [g1, g2] = giveAll(t, 2);
      const step = t.stepOf(t.active);
      t.send(t.active, g1!, { step });
      await waitUntil(() => t.match().players[t.active].attachedDons.length === 1);
      t.send(t.active, g2!, { step: step - 1 });
      await waitUntil(() => t.bags[t.active].errors.length === 1);
      t.send(t.active, g2!, { step });
      await waitUntil(() => t.bags[t.active].errors.length === 2);
      assert.equal(t.match().players[t.active].attachedDons.length, 1);
    });
  });
}
