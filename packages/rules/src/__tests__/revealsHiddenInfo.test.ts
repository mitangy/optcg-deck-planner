import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { revealsHiddenInfo } from "../revealsHiddenInfo.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, MatchState, Seat } from "../types.js";

const DRAW_ON_PLAY = "OP04-101"; // [Your Turn] [On Play] Draw 1 card.
const LOOK_ON_PLAY = "OP01-016"; // [On Play] Look at 5 cards, reveal up to 1 {Straw Hat Crew} other than Nami.

/** Apply one intent on the harness state and report what revealsHiddenInfo says about it. */
function reveals(h: Harness, seat: Seat, intent: Intent): boolean {
  const before = structuredClone(h.state) as MatchState;
  const r = h.try(seat, intent);
  if (!r.ok) throw new Error(`${intent.type} rejected: ${r.error?.message}`);
  h.state = r.state;
  return revealsHiddenInfo(before, r.state, r.events);
}

describe("revealsHiddenInfo marks the action an undo must not cross (#497)", () => {
  it("playing a vanilla card from hand reveals nothing (#497)", () => {
    const h = new Harness();
    h.hand(0, FILLER);
    h.don(0, 5);
    expect(reveals(h, 0, { type: "play_card", handIndex: 0 })).toBe(false);
  });

  it("an effect that draws a card reveals hidden info (#497)", () => {
    const h = new Harness();
    h.hand(0, DRAW_ON_PLAY);
    h.don(0, 5);
    const deckBefore = h.state.players[0].zoneInstanceIds.deck.length;
    expect(reveals(h, 0, { type: "play_card", handIndex: 0 })).toBe(true);
    expect(h.state.players[0].zoneInstanceIds.deck.length).toBe(deckBefore - 1);
  });

  it("looking at the top of the deck reveals hidden info (#497)", () => {
    const h = new Harness();
    h.hand(0, LOOK_ON_PLAY);
    h.don(0, 5);
    expect(reveals(h, 0, { type: "play_card", handIndex: 0 })).toBe(true);
  });

  it("taking a Life card reveals hidden info (#497)", () => {
    const h = new Harness();
    h.life(1, FILLER, FILLER, FILLER);
    const leader = h.state.players[0].leader;
    h.act(0, { type: "declare_attack", attackerId: leader.id, target: { kind: "leader" } });
    h.act(1, { type: "pass_block" });
    expect(reveals(h, 1, { type: "pass_counter" })).toBe(true);
  });

  it("a revealed card counts even when no zone changed (#497)", () => {
    const h = new Harness();
    expect(revealsHiddenInfo(h.state, h.state, [{ type: "card_revealed", seat: 0, defId: FILLER }])).toBe(true);
    expect(revealsHiddenInfo(h.state, h.state, [])).toBe(false);
  });

  it("a Life card leaving Life counts on its own, and so does turning one face up (#497)", () => {
    const h = new Harness();
    h.life(1, FILLER, FILLER, FILLER);
    const gone = structuredClone(h.state) as MatchState;
    gone.players[1].zoneInstanceIds.life.shift();
    gone.players[1].life.shift();
    gone.players[1].faceUpLife.shift();
    expect(revealsHiddenInfo(h.state, gone, [])).toBe(true);
    const flipped = structuredClone(h.state) as MatchState;
    flipped.players[1].faceUpLife[1] = true;
    expect(revealsHiddenInfo(h.state, flipped, [])).toBe(true);
    expect(revealsHiddenInfo(h.state, structuredClone(h.state) as MatchState, [])).toBe(false);
  });

  it("the Draw Phase draw does not count, so an accidental end turn stays undoable (#497)", () => {
    const seed = 7;
    const rng = createSeededRng(seed);
    const deck = Array.from({ length: 40 }, () => FILLER);
    let state = createMatch({ seed, firstSeat: 0, players: [{ leaderId: "ST01-001", deck }, { leaderId: "ST01-001", deck }] });
    state = skipMulligans(state, rng);
    const r = applyIntent(state, { type: "end_turn" }, { seat: 0, rng });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === "drew" && e.turnDraw)).toBe(true);
    expect(r.state.players[1].zoneInstanceIds.deck.length).toBeLessThan(state.players[1].zoneInstanceIds.deck.length);
    expect(revealsHiddenInfo(state, r.state, r.events)).toBe(false);
  });
});
