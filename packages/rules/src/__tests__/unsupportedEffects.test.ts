import { describe, expect, it } from "vitest";
import { buildTestDeck, ensureCardDef } from "../cards/definitions.js";
import {
  applyIntent,
  createMatch,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { MatchState } from "../types.js";

function fresh(): { state: MatchState; rng: ReturnType<typeof createSeededRng> } {
  const rng = createSeededRng(71);
  let state = createMatch({
    seed: 71,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: buildTestDeck(20) },
      { leaderId: "ST01-001", deck: buildTestDeck(20) },
    ],
  });
  state = skipMulligans(state, rng);
  state = structuredClone(state);
  while (state.players[0].costArea.length < 10) {
    const don = state.players[0].donDeck.pop();
    if (!don) break;
    state.players[0].costArea.push(don);
  }
  for (const don of state.players[0].costArea) don.rested = false;
  return { state, rng };
}

describe("unsupported Event effects fail closed", () => {
  it("does not offer or consume an unsupported Main Event", () => {
    const { state, rng } = fresh();
    ensureCardDef("OP15-116");
    state.players[0].hand = [
      { id: "main_event", defId: "OP15-116", rested: false, attachedDonIds: [] },
    ];
    expect(listLegalIntents(state, 0).some((intent) => intent.type === "play_card")).toBe(false);

    const before = structuredClone(state);
    const result = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unsupported_effect");
    expect(result.state).toEqual(before);
  });

  it("does not offer or consume an unsupported Counter Event", () => {
    const { state, rng } = fresh();
    ensureCardDef("OP17-076");
    state.players[1].hand = [
      { id: "counter_event", defId: "OP17-076", rested: false, attachedDonIds: [] },
    ];
    state.players[1].costArea = [
      { id: "defender_don", rested: false, attachedTo: null },
    ];
    state.phase = "counter";
    state.battle = {
      attackerSeat: 0,
      attackerId: state.players[0].leader.id,
      target: { kind: "leader" },
      defenderPowerBonus: 0,
      attackerPowerBonus: 0,
    };
    expect(
      listLegalIntents(state, 1).some((intent) => intent.type === "counter_event"),
    ).toBe(false);

    const before = structuredClone(state);
    const result = applyIntent(
      state,
      { type: "counter_event", handIndex: 0 },
      { seat: 1, rng },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unsupported_effect");
    expect(result.state).toEqual(before);
  });
});
