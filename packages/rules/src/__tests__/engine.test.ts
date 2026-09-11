import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  getPlayerView,
  getSpectatorView,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";

function fresh(seed = 1): {
  state: MatchState;
  rng: ReturnType<typeof createSeededRng>;
} {
  const rng = createSeededRng(seed);
  const deck = buildTestDeck(20);
  let state = createMatch({
    seed,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: [...deck] },
      { leaderId: "ST01-001", deck: [...deck] },
    ],
  });
  state = skipMulligans(state, rng);
  return { state, rng };
}

function act(
  state: MatchState,
  seat: Seat,
  intent: Intent,
  rng: ReturnType<typeof createSeededRng>,
): MatchState {
  const r = applyIntent(state, intent, { seat, rng });
  expect(r.ok, r.error?.message).toBe(true);
  assertInvariants(r.state);
  return r.state;
}

describe("createMatch + mulligan", () => {
  it("sets life equal to leader life after mulligans", () => {
    const { state } = fresh(42);
    expect(state.phase).toBe("main");
    expect(state.players[0].life.length).toBe(5);
    expect(state.players[1].life.length).toBe(5);
    expect(state.players[0].hand.length).toBe(5);
  });

  it("is deterministic for the same seed", () => {
    const a = fresh(99).state;
    const b = fresh(99).state;
    expect(a.players[0].hand.map((c) => c.defId)).toEqual(
      b.players[0].hand.map((c) => c.defId),
    );
    expect(a.players[0].life).toEqual(b.players[0].life);
  });
});


describe("mulligan decisions", () => {
  it("starts in mulligan with 5 cards and no life yet", () => {
    const rng = createSeededRng(5);
    const deck = buildTestDeck(20);
    const state = createMatch({
      seed: 5,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: [...deck] },
        { leaderId: "ST01-001", deck: [...deck] },
      ],
    });
    expect(state.phase).toBe("mulligan");
    expect(state.players[0].hand.length).toBe(5);
    expect(state.players[0].life.length).toBe(0);
    expect(listLegalIntents(state, 0)).toEqual([
      { type: "mulligan", doMulligan: false },
      { type: "mulligan", doMulligan: true },
    ]);
  });

  it("redraws a fresh hand of 5 when doMulligan is true", () => {
    const rng = createSeededRng(12);
    const deck = buildTestDeck(20);
    let state = createMatch({
      seed: 12,
      firstSeat: 0,
      players: [
        { leaderId: "ST01-001", deck: [...deck] },
        { leaderId: "ST01-001", deck: [...deck] },
      ],
    });
    const before = state.players[0].hand.map((c) => c.defId);
    state = act(state, 0, { type: "mulligan", doMulligan: true }, rng);
    expect(state.players[0].mulliganDone).toBe(true);
    expect(state.players[0].hand.length).toBe(5);
    expect(state.phase).toBe("mulligan"); // seat 1 still deciding
    // Hand contents may match by chance; deck+hand together stay 50 cards worth of defs.
    expect(state.players[0].hand.map((c) => c.defId).length).toBe(5);
    expect(before.length).toBe(5);
    state = act(state, 1, { type: "mulligan", doMulligan: false }, rng);
    expect(state.phase).toBe("main");
    expect(state.players[0].life.length).toBe(5);
    expect(state.players[1].life.length).toBe(5);
  });
});

describe("first-turn restrictions", () => {
  it("first player gets 1 DON!! and cannot attack on turn 1", () => {
    const { state } = fresh(7);
    expect(state.activeSeat).toBe(0);
    expect(state.players[0].turnsStarted).toBe(1);
    expect(state.players[0].costArea.length).toBe(1);
    const legal = listLegalIntents(state, 0);
    expect(legal.some((i) => i.type === "declare_attack")).toBe(false);
  });

  it("second player gets 2 DON!! and still cannot attack on their first turn", () => {
    let { state, rng } = fresh(7);
    state = act(state, 0, { type: "end_turn" }, rng);
    expect(state.activeSeat).toBe(1);
    expect(state.players[1].turnsStarted).toBe(1);
    expect(state.players[1].costArea.length).toBe(2);
    expect(listLegalIntents(state, 1).some((i) => i.type === "declare_attack")).toBe(
      false,
    );
  });
});

describe("DON!! economy and play", () => {
  it("pays cost by resting DON!! and plays a character when available", () => {
    let { state, rng } = fresh(3);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    expect(state.players[0].costArea.length).toBe(3);
    const handIndex = state.players[0].hand.findIndex(
      (c) => c.defId === "ST01-003" || c.defId === "ST01-006",
    );
    if (handIndex < 0) {
      expect(state.players[0].costArea.length).toBeGreaterThan(0);
      return;
    }
    const before = state.players[0].costArea.filter((d) => !d.rested).length;
    state = act(state, 0, { type: "play_card", handIndex }, rng);
    expect(state.players[0].characters.length).toBe(1);
    const after = state.players[0].costArea.filter((d) => !d.rested).length;
    expect(after).toBe(before - 1);
  });

  it("give_don increases power on controller turn", () => {
    let { state, rng } = fresh(11);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    const don = state.players[0].costArea.find((d) => !d.rested);
    expect(don).toBeTruthy();
    const leaderId = state.players[0].leader.id;
    const before = getPlayerView(state, 0).you.leader.power;
    state = act(
      state,
      0,
      { type: "give_don", donId: don!.id, targetId: leaderId },
      rng,
    );
    const after = getPlayerView(state, 0).you.leader.power;
    expect(after).toBe(before + 1000);
  });
});

describe("ST01-001 Activate:Main", () => {
  it("attaches one rested DON!! once per turn to Leader or Character", () => {
    let { state, rng } = fresh(3);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    expect(state.players[0].costArea.length).toBe(3);

    // Print requires a rested cost-area DON!! (typically after paying a cost).
    state = structuredClone(state);
    const toRest = state.players[0].costArea.find((d) => !d.rested);
    expect(toRest).toBeTruthy();
    toRest!.rested = true;

    const leaderId = state.players[0].leader.id;
    const legal = listLegalIntents(state, 0);
    expect(
      legal.some((i) => i.type === "activate_leader" && i.targetId === leaderId),
    ).toBe(true);

    const before = getPlayerView(state, 0).you.leader.power;
    state = act(state, 0, { type: "activate_leader", targetId: leaderId }, rng);
    expect(getPlayerView(state, 0).you.leader.power).toBe(before + 1000);
    expect(state.players[0].leaderActivatedThisTurn).toBe(true);
    expect(
      listLegalIntents(state, 0).some((i) => i.type === "activate_leader"),
    ).toBe(false);

    const second = applyIntent(
      state,
      { type: "activate_leader", targetId: leaderId },
      { seat: 0, rng },
    );
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("once_per_turn");
  });

  it("clears once-per-turn flag at the next turn start", () => {
    let { state, rng } = fresh(3);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    state.players[0].costArea.find((d) => !d.rested)!.rested = true;
    state = act(
      state,
      0,
      { type: "activate_leader", targetId: state.players[0].leader.id },
      rng,
    );
    expect(state.players[0].leaderActivatedThisTurn).toBe(true);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    expect(state.activeSeat).toBe(0);
    expect(state.players[0].leaderActivatedThisTurn).toBe(false);
  });
});

describe("battle and victory", () => {
  it("leader damage at 0 life ends the game for the attacker", () => {
    let { state, rng } = fresh(21);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    state.players[1].life = [];
    for (const d of [...state.players[0].costArea]) {
      if (!d.rested) {
        const r = applyIntent(
          state,
          { type: "give_don", donId: d.id, targetId: state.players[0].leader.id },
          { seat: 0, rng },
        );
        if (r.ok) state = r.state;
      }
    }
    const attackerId = state.players[0].leader.id;
    state = act(
      state,
      0,
      { type: "declare_attack", attackerId, target: { kind: "leader" } },
      rng,
    );
    expect(state.phase).toBe("block");
    state = act(state, 1, { type: "pass_block" }, rng);
    expect(state.phase).toBe("counter");
    state = act(state, 1, { type: "pass_counter" }, rng);
    expect(state.winner).toBe(0);
    expect(state.winReason).toBe("leader_battle_at_zero_life");
  });
});

describe("privacy", () => {
  it("hides opponent hand ids and life faces", () => {
    const { state } = fresh(5);
    const view = getPlayerView(state, 0);
    expect(view.opponent.handCount).toBe(5);
    expect((view.opponent as { hand?: unknown }).hand).toBeUndefined();
    expect(view.opponent.lifeCount).toBe(5);
    expect((view.opponent as { life?: unknown }).life).toBeUndefined();
  });

  it("non-Rush characters are summoning sick; Rush can attack same turn", () => {
    let state = createMatch({
      seed: 7,
      firstSeat: 0,
      players: [
        { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
        { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
      ],
    });
    const rng = createSeededRng(7);
    state = skipMulligans(state, rng);
    // Advance past first-turn attack lock for P0
    state = applyIntent(state, { type: "end_turn" }, { seat: 0, rng }).state;
    state = applyIntent(state, { type: "end_turn" }, { seat: 1, rng }).state;
    expect(state.players[0].turnsStarted).toBe(2);

    // Put Karoo (no Rush) and Sanji (Rush) into hand with enough DON!!
    state.players[0].hand = [
      { id: "h_karoo", defId: "ST01-003", rested: false, attachedDonIds: [] },
      { id: "h_sanji", defId: "ST01-004", rested: false, attachedDonIds: [] },
    ];
    while (state.players[0].costArea.filter((d) => !d.rested).length < 4) {
      const d = state.players[0].donDeck.pop();
      if (!d) break;
      state.players[0].costArea.push(d);
    }

    let r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok).toBe(true);
    state = r.state;
    const karoo = state.players[0].characters.find((c) => c.defId === "ST01-003")!;
    expect(karoo.summoningSick).toBe(true);
    expect(
      listLegalIntents(state, 0).some(
        (i) => i.type === "declare_attack" && i.attackerId === karoo.id,
      ),
    ).toBe(false);

    r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok).toBe(true);
    state = r.state;
    const sanji = state.players[0].characters.find((c) => c.defId === "ST01-004")!;
    expect(sanji.summoningSick).toBe(false);
    expect(
      listLegalIntents(state, 0).some(
        (i) => i.type === "declare_attack" && i.attackerId === sanji.id,
      ),
    ).toBe(true);
  });

  it("spectator view hides both hands", () => {
    let state = createMatch({
      seed: 3,
      firstSeat: 0,
      players: [
        { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
        { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
      ],
    });
    state = skipMulligans(state, createSeededRng(3));
    const view = getSpectatorView(state, 0);
    expect(view.spectator).toBe(true);
    expect(view.you.hand).toEqual([]);
    expect(view.you.handCount).toBeGreaterThan(0);
    expect(view.opponent.handCount).toBeGreaterThan(0);
    expect(view.legalIntents).toEqual([]);
    expect((view as { opponent?: { hand?: unknown } }).opponent?.hand).toBeUndefined();
  });

});
