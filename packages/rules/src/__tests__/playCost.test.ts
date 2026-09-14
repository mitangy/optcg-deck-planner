import { describe, expect, it } from "vitest";
import { buildTestDeck, ensureCardDef, getCardDef } from "../cards/definitions.js";
import {
  applyIntent,
  createMatch,
  getPlayerView,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";

describe("play cost / DON payment", () => {
  it("catalog stub uses printed cost (OP17-049 is 5, not 2)", () => {
    ensureCardDef("OP17-049");
    expect(getCardDef("OP17-049").cost).toBe(5);
  });

  it("rests 5 DON!! for a 5-cost catalog character", () => {
    const rng = createSeededRng(21);
    const deck = buildTestDeck(20);
    let state = createMatch({
      seed: 21,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: [...deck] },
        { leaderId: "ST01-001", deck: [...deck] },
      ],
    });
    state = skipMulligans(state, rng);
    for (let i = 0; i < 4; i++) {
      state = applyIntent(state, { type: "end_turn" }, { seat: state.activeSeat, rng }).state;
    }
    expect(state.activeSeat).toBe(0);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_linlin", defId: "OP17-049", rested: false, attachedDonIds: [] },
    ];
    const activeBefore = state.players[0].costArea.filter((d) => !d.rested).length;
    expect(activeBefore).toBeGreaterThanOrEqual(5);

    const r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok, r.error?.message).toBe(true);
    const rested = r.state.players[0].costArea.filter((d) => d.rested).length;
    expect(r.events.find((e) => e.type === "card_played")).toMatchObject({ costPaid: 5 });
    expect(activeBefore - r.state.players[0].costArea.filter((d) => !d.rested).length).toBe(5);
    expect(rested).toBeGreaterThanOrEqual(5);
  });

  it("exposes playCost on hand rows in Main (Teach +1 during your turn)", () => {
    const rng = createSeededRng(3);
    const deck = buildTestDeck(20);
    let state = createMatch({
      seed: 3,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: [...deck] },
        { leaderId: "OP16-080", deck: [...deck] },
      ],
    });
    state = skipMulligans(state, rng);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_linlin", defId: "OP17-049", rested: false, attachedDonIds: [] },
    ];
    const view = getPlayerView(state, 0);
    expect(view.you.hand[0]?.playCost).toBe(6);
  });
});
