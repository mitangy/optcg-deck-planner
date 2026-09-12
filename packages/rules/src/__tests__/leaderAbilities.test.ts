import { describe, expect, it } from "vitest";
import {
  buildTestDeck,
  getCardDef,
  listCardDefs,
} from "../cards/definitions.js";
import { LEADER_ABILITY_CATALOG } from "../cards/leaderAbilities.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";

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

function matchWithLeaders(
  leader0: string,
  leader1: string,
  seed = 7,
): {
  state: MatchState;
  rng: ReturnType<typeof createSeededRng>;
} {
  const rng = createSeededRng(seed);
  const deck = buildTestDeck(20);
  let state = createMatch({
    seed,
    firstSeat: 0,
    players: [
      { leaderId: leader0, deck: [...deck] },
      { leaderId: leader1, deck: [...deck] },
    ],
  });
  state = skipMulligans(state, rng);
  return { state, rng };
}

/** Advance until `seat` is active and has started at least 2 turns (can attack). */
function untilCanAttack(
  state: MatchState,
  seat: Seat,
  rng: ReturnType<typeof createSeededRng>,
): MatchState {
  let s = state;
  for (let i = 0; i < 12; i++) {
    if (s.activeSeat === seat && s.players[seat].turnsStarted >= 2) return s;
    s = act(s, s.activeSeat, { type: "end_turn" }, rng);
  }
  throw new Error("could not reach attackable turn");
}

describe("leader ability catalog", () => {
  it("documents implemented Teach / Newgate / Luffy hooks", () => {
    expect(LEADER_ABILITY_CATALOG.some((e) => e.leaderId === "OP16-080")).toBe(true);
    expect(LEADER_ABILITY_CATALOG.some((e) => e.leaderId === "OP17-001")).toBe(true);
    expect(getCardDef("OP16-080").leaderOnOppAttackTrashTriggerRetarget?.retargetTrait).toBe(
      "Blackbeard Pirates",
    );
    expect(getCardDef("OP17-001").leaderOnOppAttackTrashForPower?.power).toBe(4000);
    expect(getCardDef("OP16-080").leaderOpponentCharacterCostBonus).toBe(1);
  });
});

describe("Teach on-opp-attack redirect", () => {
  it("prompts Teach to trash a Trigger and retarget the attack", () => {
    let { state, rng } = matchWithLeaders("ST01-001", "OP16-080");
    state = untilCanAttack(state, 0, rng);

    const triggerCard = listCardDefs().find(
      (c) => c.hasTrigger || c.effectText?.includes("[Trigger]"),
    );
    expect(triggerCard).toBeTruthy();
    state.players[1].hand = [
      {
        id: "trig1",
        defId: triggerCard!.id,
        rested: false,
        attachedDonIds: [],
      },
    ];

    state = act(
      state,
      0,
      {
        type: "declare_attack",
        attackerId: state.players[0].leader.id,
        target: { kind: "leader" },
      },
      rng,
    );

    expect(state.pendingChoices[0]?.kind).toBe("leader_on_opp_attack");
    expect(state.pendingChoices[0]?.abilityId).toBe("teach_redirect");
    expect(
      listLegalIntents(state, 1).some(
        (i) => i.type === "resolve_pending_choice" && i.accept,
      ),
    ).toBe(true);

    state = act(
      state,
      1,
      {
        type: "resolve_pending_choice",
        accept: true,
        handIndex: 0,
        newTarget: { kind: "leader" },
      },
      rng,
    );

    expect(state.pendingChoices).toHaveLength(0);
    expect(state.battle?.target).toEqual({ kind: "leader" });
    expect(state.players[1].hand).toHaveLength(0);
    expect(state.players[1].trash).toContain(triggerCard!.id);
  });
});

describe("Newgate on-opp-attack power", () => {
  it("trashes a card to give the leader +4000 this battle", () => {
    let { state, rng } = matchWithLeaders("ST01-001", "OP17-001");
    state = untilCanAttack(state, 0, rng);

    state.players[1].hand = [
      {
        id: "h1",
        defId: "ST01-003",
        rested: false,
        attachedDonIds: [],
      },
    ];

    state = act(
      state,
      0,
      {
        type: "declare_attack",
        attackerId: state.players[0].leader.id,
        target: { kind: "leader" },
      },
      rng,
    );

    expect(state.pendingChoices[0]?.abilityId).toBe("newgate_battle_power");
    const leaderId = state.players[1].leader.id;

    state = act(
      state,
      1,
      {
        type: "resolve_pending_choice",
        accept: true,
        handIndex: 0,
        buffTargetId: leaderId,
      },
      rng,
    );

    expect(state.players[1].leader.battlePowerBonus).toBe(4000);
    expect(state.players[1].trash).toContain("ST01-003");
  });
});
