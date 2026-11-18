import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";
import type { GameEvent } from "../types.js";

const SMILE = "OP01-116";
const URUGE = "OP10-101";
const COST_5 = "EB01-018";

function pickEvents(h: Harness, defId: string): GameEvent[] {
  const choice = h.choice!;
  const request = choice.request;
  if (!request || !("options" in request)) throw new Error("Front choice has no options");
  const option = request.options.find((o) => o.defId === defId)!;
  const r = h.try(choice.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] });
  if (!r.ok) throw new Error(r.error?.message);
  h.state = r.state;
  return r.events;
}

describe("revealing a card while searching (#524)", () => {
  it("OP01-098 Kurozumi Orochi reveals the [Artificial Devil Fruit SMILE] it adds from the deck (#524)", () => {
    const h = new Harness();
    h.hand(0, "OP01-098");
    h.don(0, 1);
    h.deckTop(0, SMILE);
    h.play(0, "OP01-098");
    const events = pickEvents(h, SMILE);
    expect(events).toContainEqual({ type: "card_revealed", seat: 0, defId: SMILE });
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([SMILE]);
  });

  it("OP10-119 Trafalgar Law reveals the {Supernovas} Character it adds to Life from the hand (#524)", () => {
    const h = new Harness();
    h.hand(0, "OP10-119", URUGE);
    h.don(0, 7);
    h.play(0, "OP10-119");
    const events = pickEvents(h, URUGE);
    expect(events).toContainEqual({ type: "card_revealed", seat: 0, defId: URUGE });
    expect(h.state.players[0].life[0]).toBe(URUGE);
  });

  it("ST13-005 Emporio.Ivankov reveals the cost 5 Character it adds to Life from the hand (#524)", () => {
    const h = new Harness();
    h.hand(0, "ST13-005", COST_5);
    h.don(0, 3);
    h.play(0, "ST13-005");
    h.accept();
    h.pick("Top");
    const events = pickEvents(h, COST_5);
    expect(events).toContainEqual({ type: "card_revealed", seat: 0, defId: COST_5 });
    expect(h.state.players[0].life[0]).toBe(COST_5);
  });
});
