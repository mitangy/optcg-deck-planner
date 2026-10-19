import { describe, expect, it } from "vitest";
import { getPlayerView, getSpectatorView } from "../engine.js";
import { takeCard } from "../engine/state.js";
import { Harness, FILLER } from "../testing/harness.js";
import type { CardInstance } from "../types.js";

// Cards an effect reveals from a hand stay face up for the rest of the turn (#491).

const EVENT_A = "ST01-014";
const EVENT_B = "ST01-016";
const EVENT_C = "ST02-015";

/** Seat 0 reveals two of their three Events (and a filler stays hidden) with Kouzuki Oden. */
function revealed() {
  const h = new Harness();
  h.clearHands();
  const [a, b, c, filler] = h.hand(0, EVENT_A, EVENT_B, EVENT_C, FILLER) as [CardInstance, CardInstance, CardInstance, CardInstance];
  h.hand(1, FILLER);
  const [oden] = h.field(0, "OP12-004");
  h.act(0, { type: "activate_ability", sourceId: oden!.id, abilityId: "op12-004#0" });
  h.pick(a.id, b.id);
  return { h, a, b, c, filler };
}

describe("hand reveals (#491)", () => {
  it("Cards revealed from hand stay visible to the opponent, and only those cards (#491)", () => {
    const { h, a, b } = revealed();
    const opp = getPlayerView(h.state, 1);
    expect(opp.handReveals![0].map((c) => c.id)).toEqual([a.id, b.id]);
    expect(opp.handReveals![0].map((c) => c.defId)).toEqual([EVENT_A, EVENT_B]);
    expect(opp.handReveals![1]).toEqual([]);
    expect(getPlayerView(h.state, 0).handReveals![0].map((c) => c.id)).toEqual([a.id, b.id]);
    expect(getSpectatorView(h.state, 0).handReveals![0].map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it("carries no handReveals while nothing was revealed (#491)", () => {
    const h = new Harness();
    h.hand(0, EVENT_A);
    expect("handReveals" in getPlayerView(h.state, 1)).toBe(false);
  });

  it("A revealed card that leaves the hand is no longer revealed, even if it returns (#491)", () => {
    const { h, a, b } = revealed();
    const hand = h.state.players[0].hand;
    const loc = { seat: 0 as const, zone: "hand" as const, index: hand.findIndex((c) => c.id === a.id), id: a.id, defId: a.defId };
    takeCard(h.state, loc);
    h.state.players[0].hand.push({ ...a });
    expect(getPlayerView(h.state, 1).handReveals![0].map((c) => c.id)).toEqual([b.id]);
  });

  it("Reveals end when the next turn begins (#491)", () => {
    const { h } = revealed();
    h.act(0, { type: "end_turn" });
    expect("handReveals" in getPlayerView(h.state, 1)).toBe(false);
    expect(h.state.players[0].revealedHandIds ?? []).toEqual([]);
  });

  it("A mulligan clears earlier reveals (#491)", () => {
    const { h } = revealed();
    // The mulligan path discards the old hand; the cleared list must not outlive it.
    h.state.players[0].revealedHandIds = ["gone"];
    h.state.phase = "mulligan";
    h.state.players[0].mulliganDone = false;
    h.state.players[1].mulliganDone = false; // keeps the match from starting, which would clear reveals anyway
    h.act(0, { type: "mulligan", doMulligan: true });
    expect(h.state.players[0].revealedHandIds ?? []).toEqual([]);
  });

  it("Morgans reveals the opponent's remaining hand after they trash a card (#491)", () => {
    const h = new Harness();
    h.clearHands();
    h.hand(0, "OP07-090");
    h.don(0, 10);
    const [x, y] = h.hand(1, EVENT_A, EVENT_B);
    h.deckTop(1, FILLER);
    h.play(0, "OP07-090");
    h.pick(x!.id);
    // x was trashed, so only y stays face up; the freshly drawn card is hidden.
    expect(getPlayerView(h.state, 0).handReveals![1].map((c) => c.id)).toEqual([y!.id]);
  });
});
