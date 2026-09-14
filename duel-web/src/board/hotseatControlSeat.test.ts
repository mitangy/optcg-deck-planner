import { describe, expect, it } from "vitest";
import type { PlayerView, Seat } from "../net/protocol";
import { hotseatControlSeat } from "./hotseatControlSeat";

function baseView(seat: Seat, overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    seat,
    you: {
      leader: { id: `L${seat}`, defId: "ST01-001" },
      characters: [],
      stage: null,
      hand: [],
      deckCount: 40,
      trash: [],
      lifeCount: 5,
      donDeckCount: 10,
      costArea: [],
      activeDonCount: 0,
      mulliganDone: true,
    },
    opponent: {
      leader: { id: `L${1 - seat}`, defId: "OP17-001" },
      characters: [],
      stage: null,
      handCount: 5,
      deckCount: 40,
      trash: [],
      lifeCount: 5,
      donDeckCount: 10,
      costAreaCount: 0,
      activeDonCount: 0,
      mulliganDone: true,
    },
    activeSeat: 0,
    phase: "main",
    turnNumber: 1,
    battle: null,
    pendingTrigger: null,
    pendingChoices: [],
    winner: null,
    winReason: null,
    legalIntents: [],
    ...overrides,
  };
}

describe("hotseatControlSeat", () => {
  it("hands off to Rocks When Attacking (attacker seat)", () => {
    const view = baseView(1, {
      activeSeat: 0,
      phase: "block",
      battle: { attackerSeat: 0 },
      pendingChoices: [
        {
          id: "c1",
          seat: 0,
          kind: "when_attacking",
          cardDefId: "OP17-039",
          optional: true,
          prompt: "Rocks — When Attacking: trash 1?",
          abilityId: "rocks_reveal_draw",
        },
      ],
    });
    expect(hotseatControlSeat(view)).toBe(0);
  });

  it("prefers pending choice from either seat view when one socket lags", () => {
    const stale = baseView(1, {
      activeSeat: 0,
      phase: "block",
      battle: { attackerSeat: 0 },
      pendingChoices: [],
    });
    const fresh = baseView(0, {
      activeSeat: 0,
      phase: "block",
      battle: { attackerSeat: 0 },
      pendingChoices: [
        {
          id: "c1",
          seat: 0,
          kind: "when_attacking",
          cardDefId: "OP17-039",
          optional: true,
          prompt: "Rocks — When Attacking",
          abilityId: "rocks_reveal_draw",
        },
      ],
    });
    expect(hotseatControlSeat(stale, stale, fresh)).toBe(0);
  });

  it("hands off to the seat that owns a pending leader ability (e.g. Newgate)", () => {
    const view = baseView(0, {
      activeSeat: 0,
      phase: "main",
      pendingChoices: [
        {
          id: "c1",
          seat: 1,
          kind: "leader_on_opp_attack",
          cardDefId: "OP17-001",
          optional: true,
          prompt: "Newgate — trash 1 for +4000?",
          abilityId: "newgate_battle_power",
        },
      ],
    });
    expect(hotseatControlSeat(view)).toBe(1);
  });

  it("hands off to the block/counter defender", () => {
    const view = baseView(0, {
      activeSeat: 0,
      phase: "block",
      battle: { attackerSeat: 0 },
    });
    expect(hotseatControlSeat(view)).toBe(1);
  });

  it("prefers unfinished mulligan over turn player", () => {
    const v0 = baseView(0, {
      phase: "mulligan",
      activeSeat: 0,
      you: { ...baseView(0).you, mulliganDone: true },
    });
    const v1 = baseView(1, {
      phase: "mulligan",
      activeSeat: 0,
      you: { ...baseView(1).you, mulliganDone: false },
    });
    expect(hotseatControlSeat(v0, v0, v1)).toBe(1);
  });

  it("follows the active seat in main when nothing else is pending", () => {
    const view = baseView(0, { activeSeat: 1, phase: "main", pendingChoices: [] });
    expect(hotseatControlSeat(view)).toBe(1);
  });
});
