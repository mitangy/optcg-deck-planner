import { describe, expect, it } from "vitest";
import {
  buildTestDeck,
  ensureCardDef,
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
  it("documents implemented Teach / Newgate / Luffy / Rocks hooks", () => {
    expect(LEADER_ABILITY_CATALOG.some((e) => e.leaderId === "OP16-080")).toBe(true);
    expect(LEADER_ABILITY_CATALOG.some((e) => e.leaderId === "OP17-001")).toBe(true);
    expect(LEADER_ABILITY_CATALOG.some((e) => e.leaderId === "OP17-039")).toBe(true);
    expect(getCardDef("OP16-080").leaderOnOppAttackTrashTriggerRetarget?.retargetTrait).toBe(
      "Blackbeard Pirates",
    );
    expect(getCardDef("OP17-001").leaderOnOppAttackTrashForPower?.power).toBe(4000);
    expect(getCardDef("OP16-080").leaderOpponentCharacterCostBonus).toBe(1);
    expect(getCardDef("OP17-039").leaderWhenAttackingTrashRevealDraw).toEqual({
      revealTrait: "Rocks Pirates",
      draw: 2,
    });
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

describe("Rocks when-attacking reveal draw", () => {
  it("trashes a card, reveals top, and draws 2 when trait matches", () => {
    let { state, rng } = matchWithLeaders("OP17-039", "ST01-001");
    state = untilCanAttack(state, 0, rng);

    // Ensure trait lookup for a Rocks Pirates id (auto-stubbed with TRAITS_BY_ID).
    state.players[0].hand = [
      {
        id: "h1",
        defId: "ST01-003",
        rested: false,
        attachedDonIds: [],
      },
    ];
    // Put a Rocks Pirates card on top of the deck (stub gains traits via TRAITS_BY_ID).
    ensureCardDef("OP17-118");
    state.players[0].deck = ["OP17-118", ...state.players[0].deck];

    const handBefore = state.players[0].hand.length;
    const deckBefore = state.players[0].deck.length;

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

    expect(state.pendingChoices[0]?.kind).toBe("when_attacking");
    expect(state.pendingChoices[0]?.abilityId).toBe("rocks_reveal_draw");

    state = act(
      state,
      0,
      {
        type: "resolve_pending_choice",
        accept: true,
        handIndex: 0,
      },
      rng,
    );

    expect(state.pendingChoices).toHaveLength(0);
    expect(state.players[0].trash).toContain("ST01-003");
    // Trashed 1, then drew 2 (including the revealed Rocks card from top).
    expect(state.players[0].hand.length).toBe(handBefore - 1 + 2);
    expect(state.players[0].deck.length).toBe(deckBefore - 2);
    expect(state.players[0].hand.some((c) => c.defId === "OP17-118")).toBe(true);
  });

  it("reveals without drawing when top is not Rocks Pirates", () => {
    let { state, rng } = matchWithLeaders("OP17-039", "ST01-001");
    state = untilCanAttack(state, 0, rng);

    state.players[0].hand = [
      {
        id: "h1",
        defId: "ST01-003",
        rested: false,
        attachedDonIds: [],
      },
    ];
    state.players[0].deck = ["ST01-004", ...state.players[0].deck];
    const deckTop = state.players[0].deck[0];
    const handBefore = state.players[0].hand.length;

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
    state = act(
      state,
      0,
      { type: "resolve_pending_choice", accept: true, handIndex: 0 },
      rng,
    );

    expect(state.players[0].hand.length).toBe(handBefore - 1);
    expect(state.players[0].deck[0]).toBe(deckTop);
  });

  it("does not prompt when a Character attacks (Leader When Attacking only)", () => {
    let { state, rng } = matchWithLeaders("OP17-039", "ST01-001");
    state = untilCanAttack(state, 0, rng);

    state.players[0].hand = [
      { id: "h1", defId: "ST01-003", rested: false, attachedDonIds: [] },
    ];
    state.players[0].characters = [
      {
        id: "ch1",
        defId: "ST01-004",
        rested: false,
        attachedDonIds: [],
        summoningSick: false,
      },
    ];

    state = act(
      state,
      0,
      {
        type: "declare_attack",
        attackerId: "ch1",
        target: { kind: "leader" },
      },
      rng,
    );

    expect(state.pendingChoices.some((c) => c.abilityId === "rocks_reveal_draw")).toBe(
      false,
    );
  });

  it("blocks pass_block until When Attacking is resolved", () => {
    let { state, rng } = matchWithLeaders("OP17-039", "ST01-001");
    state = untilCanAttack(state, 0, rng);
    state.players[0].hand = [
      { id: "h1", defId: "ST01-003", rested: false, attachedDonIds: [] },
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
    expect(state.pendingChoices[0]?.abilityId).toBe("rocks_reveal_draw");
    const blocked = applyIntent(state, { type: "pass_block" }, { seat: 1, rng });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("pending_choice");
  });

  it("Rocks vs Teach enqueues simultaneous pending in APNAP order [rocks, teach]", () => {
    let { state, rng } = matchWithLeaders("OP17-039", "OP16-080");
    state = untilCanAttack(state, 0, rng);

    state.players[0].hand = [
      { id: "h1", defId: "ST01-003", rested: false, attachedDonIds: [] },
    ];
    state.players[0].deck = ["ST01-004", ...state.players[0].deck];

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

    expect(state.pendingChoices.map((c) => c.abilityId)).toEqual([
      "rocks_reveal_draw",
      "teach_redirect",
    ]);
    expect(state.pendingChoices[0]?.seat).toBe(0);
    expect(state.pendingChoices[1]?.seat).toBe(1);
  });
});
