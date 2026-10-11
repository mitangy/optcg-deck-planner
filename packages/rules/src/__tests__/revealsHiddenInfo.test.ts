import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { revealsHiddenInfo } from "../revealsHiddenInfo.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, MatchState, PendingChoice, Seat } from "../types.js";

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

describe("revealsHiddenInfo keeps Undo alive for public and own-hand actions (#535)", () => {
  /** A one-card-deep copy of `h.state` with `choice` queued, as the engine would after an intent. */
  function withChoice(h: Harness, choice: Partial<PendingChoice>): MatchState {
    const next = structuredClone(h.state) as MatchState;
    next.pendingChoices.push({ id: "choice_x", seat: 0, kind: "effect", cardDefId: FILLER, optional: false, prompt: "", ...choice });
    return next;
  }

  it("choosing a card to trash from your own hand does not reveal (#535)", () => {
    // OP16-080 Teach: attacked, pay the cost by trashing a [Trigger] card from your own hand (a private select).
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    h.hand(1, "ST01-014", FILLER);
    h.act(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
    expect(reveals(h, 1, { type: "resolve_pending_choice", accept: true })).toBe(false);
    expect(h.choice).toMatchObject({ seat: 1, privateToSeat: 1, request: { type: "select" } });
  });

  it("returning a Character from the field to its owner's hand does not reveal (#535)", () => {
    // EB01-020 Chambres returns your Character (card_revealed from the field), then asks for a card from your own hand.
    const h = new Harness();
    h.hand(0, "EB01-020", "ST01-009");
    h.field(0, "ST01-009"); // the deck is all FILLER, so a card_revealed for it cannot pass as a deck-top reveal
    h.don(0, 1);
    const before = structuredClone(h.state) as MatchState;
    const r = h.try(0, { type: "play_card", handIndex: 0 });
    if (!r.ok) throw new Error(r.error?.message);
    expect(r.events.some((e) => e.type === "card_revealed")).toBe(true);
    expect(r.state.pendingChoices[0]).toMatchObject({ privateToSeat: 0 });
    expect(revealsHiddenInfo(before, r.state, r.events)).toBe(false);
  });

  it("a card revealed from hand still reveals (#535)", () => {
    const h = new Harness();
    const [card] = h.hand(0, "ST01-009"); // not FILLER: the deck top must not match the revealed card
    const next = structuredClone(h.state) as MatchState;
    next.players[0].revealedHandIds = [card!.id];
    const event = { type: "card_revealed", seat: 0, defId: "ST01-009" } as const;
    expect(revealsHiddenInfo(h.state, next, [event])).toBe(true);
    // Already face up before: nothing new is shown.
    expect(revealsHiddenInfo(next, structuredClone(next) as MatchState, [event])).toBe(false);
  });

  it("revealing the top card of the deck still reveals (#535)", () => {
    const h = new Harness();
    const [top] = h.deckTop(0, "ST01-009");
    expect(top).toBeDefined();
    expect(revealsHiddenInfo(h.state, h.state, [{ type: "card_revealed", seat: 0, defId: "ST01-009" }])).toBe(true);
    expect(revealsHiddenInfo(h.state, h.state, [{ type: "card_revealed", seat: 0, defId: "ST01-012" }])).toBe(false);
  });

  it("a private choice over the opponent's hand reveals, by binding or by option (#535)", () => {
    const h = new Harness();
    const [theirs] = h.hand(1, FILLER);
    const byBinding = withChoice(h, { privateToSeat: 0, bindings: { o0: theirs!.id } });
    expect(revealsHiddenInfo(h.state, byBinding, [])).toBe(true);
    const byOption = withChoice(h, {
      privateToSeat: 0,
      request: { type: "select", min: 1, max: 1, options: [{ id: "o0", zone: "hand", ownerSeat: 1, eligible: true }] },
    });
    expect(revealsHiddenInfo(h.state, byOption, [])).toBe(true);
    // The same shapes over the chooser's own hand are not a reveal.
    const [mine] = h.hand(0, FILLER);
    const own = withChoice(h, {
      privateToSeat: 0,
      bindings: { o0: mine!.id },
      request: { type: "select", min: 1, max: 1, options: [{ id: "o0", zone: "hand", ownerSeat: 0, eligible: true }] },
    });
    expect(revealsHiddenInfo(h.state, own, [])).toBe(false);
  });

  it("a private choice over deck or Life cards reveals, by option (#535)", () => {
    const h = new Harness();
    for (const zone of ["deck", "life"] as const) {
      const next = withChoice(h, {
        request: { type: "select", min: 0, max: 1, options: [{ id: "o0", zone, ownerSeat: 0, eligible: true }] },
      });
      expect(revealsHiddenInfo(h.state, next, [])).toBe(true);
    }
  });

  it("a Life trigger check reveals even when no zone changed yet (#535)", () => {
    const h = new Harness();
    expect(revealsHiddenInfo(h.state, withChoice(h, { kind: "life_trigger" }), [])).toBe(true);
    expect(revealsHiddenInfo(h.state, withChoice(h, {}), [])).toBe(false);
  });
});
