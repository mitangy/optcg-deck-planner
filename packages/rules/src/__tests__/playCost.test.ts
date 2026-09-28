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

  it("does not apply Teach's field-cost modifier to cards in the opponent's hand", () => {
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
    expect(view.you.hand[0]?.playCost).toBe(5);
  });

  it("reduces OP17-005 hand cost by four when an opponent has 10000 power", () => {
    const rng = createSeededRng(8);
    const state = createMatch({
      seed: 8,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
      ],
    });
    state.phase = "main";
    state.activeSeat = 0;
    state.players[0].turnsStarted = 2;
    state.players[0].costArea = Array.from({ length: 6 }, (_, i) => ({
      id: `don_${i}`,
      rested: false,
      attachedTo: null,
    }));
    state.players[0].hand = [
      { id: "h_newgate", defId: "OP17-005", rested: false, attachedDonIds: [] },
    ];
    state.players[1].characters = [
      { id: "teach_1", defId: "OP16-119", rested: false, attachedDonIds: [] },
    ];
    expect(getPlayerView(state, 0).you.hand[0]?.playCost).toBe(6);
    const played = applyIntent(
      state,
      { type: "play_card", handIndex: 0 },
      { seat: 0, rng },
    );
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.events.find((event) => event.type === "card_played")).toMatchObject({ costPaid: 6 });
  });

  it("applies OP17-005 and OP17-008 Leader base-power replacements only to matching Leaders", () => {
    const rng = createSeededRng(9);
    const state = createMatch({
      seed: 9,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
      ],
    });
    state.phase = "main";
    state.activeSeat = 0;
    state.players[0].turnsStarted = 2;
    state.players[0].costArea = Array.from({ length: 10 }, (_, i) => ({
      id: `don_${i}`,
      rested: false,
      attachedTo: null,
    }));
    state.players[0].hand = [
      { id: "h_newgate", defId: "OP17-005", rested: false, attachedDonIds: [] },
    ];
    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(getPlayerView(played.state, 0).you.leader.power).toBe(8000);

    const opponentTurn = applyIntent(played.state, { type: "end_turn" }, { seat: 0, rng });
    expect(opponentTurn.ok).toBe(true);
    expect(getPlayerView(opponentTurn.state, 0).you.leader.power).toBe(8000);
    const expired = applyIntent(opponentTurn.state, { type: "end_turn" }, { seat: 1, rng });
    expect(expired.ok).toBe(true);
    expect(getPlayerView(expired.state, 0).you.leader.power).toBe(5000);

    const nonMatching = structuredClone(played.state);
    nonMatching.players[0].leader.defId = "OP16-080";
    delete nonMatching.players[0].leader.turnBasePowerOverride;
    expect(getPlayerView(nonMatching, 0).you.leader.power).toBe(5000);
  });

  it("reduces ST23-001 Uta by four when its controller has a 10000-power Character", () => {
    const state = createMatch({
      seed: 10,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
        { leaderId: "ST01-001", deck: buildTestDeck(20) },
      ],
    });
    state.phase = "main";
    state.activeSeat = 0;
    state.players[0].turnsStarted = 2;
    state.players[0].costArea = Array.from({ length: 2 }, (_, i) => ({
      id: `don_${i}`,
      rested: false,
      attachedTo: null,
    }));
    state.players[0].characters = [
      { id: "teach_1", defId: "OP16-119", rested: false, attachedDonIds: [] },
    ];
    state.players[0].hand = [
      { id: "h_uta", defId: "ST23-001", rested: false, attachedDonIds: [] },
    ];
    expect(getPlayerView(state, 0).you.hand[0]?.playCost).toBe(2);
  });
});
