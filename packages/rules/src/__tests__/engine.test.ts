import { describe, expect, it } from "vitest";
import { buildTestDeck } from "../cards/definitions.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  getPlayerView,
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
      (c) => c.defId === "ST01-002",
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
});
