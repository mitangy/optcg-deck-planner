import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID, getCardDef } from "../cards/definitions.js";
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
import type { Intent, MatchState, PendingChoice, Seat } from "../types.js";

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

describe("Gol.D.Roger blocker win", () => {
  it("wins when the opponent activates Blocker while either player has no Life", () => {
    const { state, rng } = fresh(77);
    const next = structuredClone(state) as MatchState;
    next.phase = "block";
    next.activeSeat = 0;
    next.players[0].life = [];
    next.players[0].faceUpLife = [];
    next.players[0].characters = [
      { id: "roger", defId: "OP09-118", rested: true, attachedDonIds: [] },
    ];
    next.players[1].characters = [
      { id: "blocker", defId: "ST01-006", rested: false, attachedDonIds: [] },
    ];
    next.battle = {
      attackerSeat: 0,
      attackerId: "roger",
      target: { kind: "leader" },
      defenderPowerBonus: 0,
      attackerPowerBonus: 0,
    };
    const result = applyIntent(next, { type: "declare_block", blockerId: "blocker" }, { seat: 1, rng });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.state.winner).toBe(0);
    expect(result.state.phase).toBe("game_over");
  });
});

describe("Catarina Devon attack ability", () => {
  it("copies the selected opponent Character's power for the turn", () => {
    const { state, rng } = fresh(78);
    const next = structuredClone(state) as MatchState;
    next.phase = "main";
    next.activeSeat = 0;
    next.players[0].turnsStarted = 2;
    next.players[0].characters = [
      { id: "devon", defId: "OP16-104", rested: false, attachedDonIds: [] },
    ];
    next.players[1].characters = [
      { id: "target", defId: "OP12-002", rested: true, attachedDonIds: [] },
    ];
    const declared = applyIntent(
      next,
      { type: "declare_attack", attackerId: "devon", target: { kind: "leader" } },
      { seat: 0, rng },
    );
    expect(declared.ok, declared.error?.message).toBe(true);
    const choice = declared.state.pendingChoices.find((pending) => pending.abilityId === "copy_opponent_power");
    expect(choice).toBeTruthy();
    const resolved = applyIntent(
      declared.state,
      { type: "resolve_pending_choice", accept: true, copyPowerTargetId: "target" },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].characters[0]?.turnBasePowerOverride).toBe(6000);
    expect(getPlayerView(resolved.state, 0).you.characters[0]?.power).toBe(6000);
    resolved.state.phase = "main";
    resolved.state.battle = null;
    const ended = applyIntent(resolved.state, { type: "end_turn" }, { seat: 0, rng });
    expect(ended.ok).toBe(true);
    expect(getPlayerView(ended.state, 0).you.characters[0]?.power).toBe(3000);
  });
});

describe("draw then trash Trigger", () => {
  it("OP16-116 draws two and requires one card to be trashed", () => {
    const { state, rng } = fresh(80);
    const next = structuredClone(state) as MatchState;
    next.phase = "damage";
    next.pendingChoices = [
      {
        id: "life_zehaha",
        seat: 0,
        kind: "life_trigger",
        cardDefId: "OP16-116",
        optional: true,
        prompt: "Zehahahahaha! — Trigger",
        privateToSeat: 0,
        hideCardDefFromOthers: true,
      },
    ];
    const handBefore = next.players[0].hand.length;

    const accepted = applyIntent(
      next,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng },
    );
    expect(accepted.ok, accepted.error?.message).toBe(true);
    expect(accepted.state.players[0].hand).toHaveLength(handBefore + 2);
    expect(accepted.state.players[0].trash).toContain("OP16-116");
    expect(accepted.state.pendingChoices[0]?.abilityId).toBe("discard_hand_count");

    const trashedDefId = accepted.state.players[0].hand[0]!.defId;
    const discarded = applyIntent(
      accepted.state,
      { type: "resolve_pending_choice", accept: true, handIndices: [0] },
      { seat: 0, rng },
    );
    expect(discarded.ok, discarded.error?.message).toBe(true);
    expect(discarded.state.players[0].hand).toHaveLength(handBefore + 1);
    expect(discarded.state.players[0].trash).toContain(trashedDefId);
    expect(discarded.state.pendingChoices).toHaveLength(0);
    assertInvariants(discarded.state);
  });
});

describe("effect negation", () => {
  it("OP16-119 Trigger negates a Character and then K.O.s a cost-5-or-less Character", () => {
    const { state, rng } = fresh(81);
    const next = structuredClone(state) as MatchState;
    next.phase = "damage";
    next.players[1].characters = [
      { id: "target", defId: "OP09-086", rested: false, attachedDonIds: [] },
    ];
    next.pendingChoices = [
      {
        id: "life_teach",
        seat: 0,
        kind: "life_trigger",
        cardDefId: "OP16-119",
        optional: true,
        prompt: "Teach Trigger",
        privateToSeat: 0,
      },
    ];

    const triggered = applyIntent(next, { type: "resolve_pending_choice", accept: true }, { seat: 0, rng });
    expect(triggered.ok, triggered.error?.message).toBe(true);
    expect(triggered.state.pendingChoices[0]?.abilityId).toBe("trigger_negate_opponent_card");

    const negated = applyIntent(
      triggered.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "target" },
      { seat: 0, rng },
    );
    expect(negated.ok, negated.error?.message).toBe(true);
    expect(negated.state.players[1].characters[0]?.effectsNegatedThroughTurn).toBe(negated.state.turnNumber);
    expect(negated.state.pendingChoices[0]?.abilityId).toBe("trigger_ko_opponent_cost");

    const ko = applyIntent(
      negated.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "target" },
      { seat: 0, rng },
    );
    expect(ko.ok, ko.error?.message).toBe(true);
    expect(ko.state.players[1].characters).toHaveLength(0);
    expect(ko.state.players[1].trash).toContain("OP09-086");
  });

  it("OP09-093 negates the opposing Leader and locks a Character through its next turn", () => {
    const { state, rng } = fresh(82);
    const next = structuredClone(state) as MatchState;
    next.activeSeat = 0;
    next.phase = "main";
    next.players[0].leader.defId = "OP16-080";
    next.players[0].characters = [
      { id: "teach", defId: "OP09-093", rested: false, attachedDonIds: [], summoningSick: true },
    ];
    next.players[1].turnsStarted = 2;
    next.players[1].characters = [
      { id: "locked", defId: "ST30-005", rested: false, attachedDonIds: [] },
    ];

    const activated = applyIntent(
      next,
      { type: "activate_ability", sourceId: "teach", abilityId: "teach_negate_opponent" },
      { seat: 0, rng },
    );
    expect(activated.ok, activated.error?.message).toBe(true);
    expect(activated.state.pendingChoices[0]?.abilityId).toBe("teach_negate_leader");

    const leader = applyIntent(
      activated.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: activated.state.players[1].leader.id },
      { seat: 0, rng },
    );
    expect(leader.ok, leader.error?.message).toBe(true);
    expect(leader.state.pendingChoices[0]?.abilityId).toBe("teach_negate_character");

    const character = applyIntent(
      leader.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "locked" },
      { seat: 0, rng },
    );
    expect(character.ok, character.error?.message).toBe(true);
    expect(character.state.players[1].characters[0]?.cannotAttackThroughTurn).toBe(character.state.turnNumber + 1);

    const ended = applyIntent(character.state, { type: "end_turn" }, { seat: 0, rng });
    expect(ended.ok, ended.error?.message).toBe(true);
    expect(listLegalIntents(ended.state, 1).some((intent) => intent.type === "declare_attack" && intent.attackerId === "locked")).toBe(false);
  });
});

describe("On K.O. revival and DON!! costs", () => {
  it("Marco can replace opponent-effect removal and replay itself from trash", () => {
    const { state, rng } = fresh(83);
    const next = structuredClone(state) as MatchState;
    next.players[1].trash = ["OP17-015"];
    next.players[1].zoneInstanceIds.trash = ["older_marco"];
    next.activeSeat = 0;
    next.phase = "main";
    next.players[0].leader.defId = "OP16-080";
    next.players[1].life = next.players[1].life.slice(0, 3);
    next.players[1].faceUpLife = next.players[1].faceUpLife.slice(0, 3);
    next.players[1].characters = [
      { id: "marco", defId: "OP17-015", rested: false, attachedDonIds: [] },
      { id: "target", defId: "OP12-002", rested: false, attachedDonIds: [] },
    ];
    next.players[1].hand = [
      { id: "whitebeard_cost", defId: "OP12-002", rested: false, attachedDonIds: [] },
    ];
    next.pendingChoices = [
      {
        id: "rayleigh_ko",
        seat: 0,
        kind: "on_play",
        cardDefId: "OP14-108",
        optional: true,
        prompt: "Rayleigh K.O.",
        abilityId: "on_play_ko_power",
      },
    ];

    const targeted = applyIntent(
      next,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "target" },
      { seat: 0, rng },
    );
    expect(targeted.ok, targeted.error?.message).toBe(true);
    expect(targeted.state.players[1].characters.map((card) => card.id)).toEqual(["marco", "target"]);
    expect(targeted.state.pendingChoices[0]?.abilityId).toBe("marco_removal_replacement");

    const replaced = applyIntent(
      targeted.state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 1, rng },
    );
    expect(replaced.ok, replaced.error?.message).toBe(true);
    expect(replaced.state.players[1].characters.map((card) => card.id)).toEqual(["target"]);
    expect(replaced.state.pendingChoices[0]?.abilityId).toBe("on_ko_revive_self");

    const revived = applyIntent(
      replaced.state,
      { type: "resolve_pending_choice", accept: true, handIndex: 0 },
      { seat: 1, rng },
    );
    expect(revived.ok, revived.error?.message).toBe(true);
    expect(revived.state.players[1].characters.some((card) => card.defId === "OP17-015")).toBe(true);
    expect(revived.state.players[1].characters.find((card) => card.defId === "OP17-015")?.id).toBe("marco");
    expect(revived.state.players[1].zoneInstanceIds.trash).toEqual(["older_marco", "whitebeard_cost"]);
    expect(revived.state.players[1].trash).toContain("OP12-002");
  });

  it("EB03-034 can return a chosen DON!! to add deck top to Life after battle K.O.", () => {
    const { state, rng } = fresh(84);
    const next = structuredClone(state) as MatchState;
    next.activeSeat = 0;
    next.phase = "block";
    next.players[0].characters = [
      { id: "attacker", defId: "OP16-119", rested: true, attachedDonIds: [] },
    ];
    next.players[1].characters = [
      { id: "linlin", defId: "EB03-034", rested: true, attachedDonIds: [] },
    ];
    const don = next.players[1].donDeck.pop()!;
    don.rested = true;
    next.players[1].costArea = [don];
    next.battle = {
      attackerSeat: 0,
      attackerId: "attacker",
      target: { kind: "character", instanceId: "linlin" },
      defenderPowerBonus: 0,
      attackerPowerBonus: 0,
    };
    const lifeBefore = next.players[1].life.length;

    const blocked = applyIntent(next, { type: "pass_block" }, { seat: 1, rng });
    expect(blocked.ok, blocked.error?.message).toBe(true);
    const damaged = applyIntent(blocked.state, { type: "pass_counter" }, { seat: 1, rng });
    expect(damaged.ok, damaged.error?.message).toBe(true);
    expect(damaged.state.pendingChoices[0]?.abilityId).toBe("on_ko_return_don_add_life");

    const resolved = applyIntent(
      damaged.state,
      { type: "resolve_pending_choice", accept: true, selectedDonIds: [don.id] },
      { seat: 1, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[1].life).toHaveLength(lifeBefore + 1);
    expect(resolved.state.players[1].costArea).toHaveLength(0);
    expect(resolved.state.players[1].donDeck.some((entry) => entry.id === don.id)).toBe(true);
  });
});

describe("Blackbeard On K.O. hooks", () => {
  it("draws when a supported On K.O. Character is removed in battle", () => {
    const { state, rng } = fresh(80);
    let next = structuredClone(state) as MatchState;
    next.activeSeat = 0;
    next.players[0].turnsStarted = 2;
    next.players[0].characters = [];
    next.players[1].characters = [
      { id: "vasco", defId: "OP16-110", rested: true, attachedDonIds: [] },
    ];
    const handBefore = next.players[1].hand.length;
    next = act(next, 0, { type: "declare_attack", attackerId: next.players[0].leader.id, target: { kind: "character", instanceId: "vasco" } }, rng);
    next = act(next, 1, { type: "pass_block" }, rng);
    next = act(next, 1, { type: "pass_counter" }, rng);
    expect(next.players[1].characters).toHaveLength(0);
    expect(next.players[1].hand.length).toBe(handBefore + 1);
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
      legal.some(
        (i) =>
          i.type === "activate_ability" &&
          i.sourceId === leaderId &&
          i.abilityId === "leader_give_rested_don" &&
          i.targetId === leaderId,
      ),
    ).toBe(true);

    const before = getPlayerView(state, 0).you.leader.power;
    state = act(
      state,
      0,
      {
        type: "activate_ability",
        sourceId: leaderId,
        abilityId: "leader_give_rested_don",
        targetId: leaderId,
      },
      rng,
    );
    expect(getPlayerView(state, 0).you.leader.power).toBe(before + 1000);
    expect(state.players[0].leaderActivatedThisTurn).toBe(true);
    expect(
      listLegalIntents(state, 0).some(
        (i) => i.type === "activate_ability" && i.abilityId === "leader_give_rested_don",
      ),
    ).toBe(false);

    const second = applyIntent(
      state,
      {
        type: "activate_ability",
        sourceId: leaderId,
        abilityId: "leader_give_rested_don",
        targetId: leaderId,
      },
      { seat: 0, rng },
    );
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("once_per_turn");
  });

  it("still accepts legacy activate_leader intents", () => {
    let { state, rng } = fresh(3);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    state.players[0].costArea.find((d) => !d.rested)!.rested = true;
    const leaderId = state.players[0].leader.id;
    const before = getPlayerView(state, 0).you.leader.power;
    state = act(state, 0, { type: "activate_leader", targetId: leaderId }, rng);
    expect(getPlayerView(state, 0).you.leader.power).toBe(before + 1000);
    expect(state.players[0].leaderActivatedThisTurn).toBe(true);
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
      {
        type: "activate_ability",
        sourceId: state.players[0].leader.id,
        abilityId: "leader_give_rested_don",
        targetId: state.players[0].leader.id,
      },
      rng,
    );
    expect(state.players[0].leaderActivatedThisTurn).toBe(true);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    expect(state.activeSeat).toBe(0);
    expect(state.players[0].leaderActivatedThisTurn).toBe(false);
  });
});

describe("OP16-021 Moby Dick Stage Activate:Main", () => {
  it("trashes Stage and gives one rested DON!! to Leader or Character", () => {
    let { state, rng } = fresh(11);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);

    // Place Moby Dick on Stage and ensure a rested cost-area DON!!.
    const stage = {
      id: "stage-moby",
      defId: "OP16-021",
      rested: false,
      attachedDonIds: [] as string[],
    };
    state.players[0].stage = stage;
    state.players[0].costArea.find((d) => !d.rested)!.rested = true;

    const leaderId = state.players[0].leader.id;
    const legal = listLegalIntents(state, 0);
    expect(
      legal.some(
        (i) =>
          i.type === "activate_ability" &&
          i.sourceId === stage.id &&
          i.abilityId === "stage_trash_give_rested_don" &&
          i.targetId === leaderId,
      ),
    ).toBe(true);

    const before = getPlayerView(state, 0).you.leader.power;
    const trashBefore = state.players[0].trash.length;
    state = act(
      state,
      0,
      {
        type: "activate_ability",
        sourceId: stage.id,
        abilityId: "stage_trash_give_rested_don",
        targetId: leaderId,
      },
      rng,
    );
    expect(state.players[0].stage).toBeNull();
    expect(state.players[0].trash[state.players[0].trash.length - 1]).toBe("OP16-021");
    expect(state.players[0].trash.length).toBe(trashBefore + 1);
    expect(getPlayerView(state, 0).you.leader.power).toBe(before + 1000);
    expect(
      listLegalIntents(state, 0).some(
        (i) =>
          i.type === "activate_ability" && i.abilityId === "stage_trash_give_rested_don",
      ),
    ).toBe(false);
  });

  it("allows Stage Activate with zero target but rejects attaching without a rested DON!!", () => {
    let { state, rng } = fresh(11);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    state.players[0].stage = {
      id: "stage-moby",
      defId: "OP16-021",
      rested: false,
      attachedDonIds: [],
    };
    for (const d of state.players[0].costArea) d.rested = false;

    expect(
      listLegalIntents(state, 0).some(
        (i) =>
          i.type === "activate_ability" &&
          i.abilityId === "stage_trash_give_rested_don" &&
          i.targetId == null,
      ),
    ).toBe(true);

    const zeroTarget = applyIntent(
      state,
      {
        type: "activate_ability",
        sourceId: "stage-moby",
        abilityId: "stage_trash_give_rested_don",
      },
      { seat: 0, rng },
    );
    expect(zeroTarget.ok, zeroTarget.error?.message).toBe(true);
    expect(zeroTarget.state.players[0].stage).toBeNull();

    const r = applyIntent(
      state,
      {
        type: "activate_ability",
        sourceId: "stage-moby",
        abilityId: "stage_trash_give_rested_don",
        targetId: state.players[0].leader.id,
      },
      { seat: 0, rng },
    );
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("no_rested_don");
  });
});

describe("battle and victory", () => {
  it("leader damage at 0 life ends the game for the attacker", () => {
    let { state, rng } = fresh(21);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    state.players[1].life = [];
    state.players[1].faceUpLife = [];
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

  it("exposes printedPower and statusLabels on card views", () => {
    const { state } = fresh(5);
    const view = getPlayerView(state, 0);
    expect(view.you.leader.printedPower).toBe(view.you.leader.power);
    expect(Array.isArray(view.you.leader.statusLabels)).toBe(true);
    state.players[0].leader.statusLabels = ["Stun"];
    expect(getPlayerView(state, 0).you.leader.statusLabels).toContain("Stun");
  });

  it("conditional Rush is not granted unconditionally; ordinary Rush can attack immediately", () => {
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

    // Sanji needs DON!! x2 for Rush (not implemented yet); Roger has ordinary Rush.
    state.players[0].hand = [
      { id: "h_sanji", defId: "ST01-004", rested: false, attachedDonIds: [] },
      { id: "h_roger", defId: "OP09-118", rested: false, attachedDonIds: [] },
    ];
    while (state.players[0].costArea.filter((d) => !d.rested).length < 12) {
      const d = state.players[0].donDeck.pop();
      if (!d) break;
      state.players[0].costArea.push(d);
    }

    let r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok).toBe(true);
    state = r.state;
    const sanji = state.players[0].characters.find((c) => c.defId === "ST01-004")!;
    expect(sanji.summoningSick).toBe(true);
    expect(
      listLegalIntents(state, 0).some(
        (i) => i.type === "declare_attack" && i.attackerId === sanji.id,
      ),
    ).toBe(false);

    // Isolate the unconditional-Rush assertion from Sanji's paid play cost.
    for (const don of state.players[0].costArea) don.rested = false;
    r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok).toBe(true);
    state = r.state;
    const roger = state.players[0].characters.find((c) => c.defId === "OP09-118")!;
    expect(roger.summoningSick).toBe(true);
    expect(getPlayerView(state, 0).you.characters.find((card) => card.id === roger.id)?.summoningSick).toBe(false);
    expect(
      listLegalIntents(state, 0).some(
        (i) => i.type === "declare_attack" && i.attackerId === roger.id,
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

describe("pending-choice queue (chain-ready ability/trigger prompts)", () => {
  it("blocks Main-phase actions and offers only the front choice's seat resolve intents", () => {
    let { state, rng } = fresh(1);
    state = structuredClone(state);
    const chainA: PendingChoice = {
      id: "choice_a",
      seat: 0,
      kind: "on_play",
      cardDefId: "ST01-005",
      optional: true,
      prompt: "Usopp — On Play: draw 1 card?",
    };
    const chainB: PendingChoice = {
      id: "choice_b",
      seat: 1,
      kind: "activate_main",
      cardDefId: "ST01-001",
      optional: true,
      prompt: "Monkey.D.Luffy — Activate:Main?",
    };
    state.pendingChoices = [chainA, chainB];

    // Front of the FIFO queue (seat 0) may resolve; the other seat cannot.
    expect(listLegalIntents(state, 0)).toEqual([
      { type: "resolve_pending_choice", accept: true },
      { type: "resolve_pending_choice", accept: false },
    ]);
    expect(listLegalIntents(state, 1)).toEqual([]);

    const blocked = applyIntent(state, { type: "end_turn" }, { seat: 0, rng });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("pending_choice");

    const r1 = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: false },
      { seat: 0, rng },
    );
    expect(r1.ok).toBe(true);
    state = r1.state;
    expect(state.pendingChoices).toHaveLength(1);
    expect(state.pendingChoices[0].id).toBe("choice_b");

    // Chain advanced: seat 1 can now resolve; seat 0 has nothing pending.
    expect(listLegalIntents(state, 1).length).toBeGreaterThan(0);
    expect(listLegalIntents(state, 0)).toEqual([]);

    const r2 = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 1, rng },
    );
    expect(r2.ok).toBe(true);
    expect(r2.state.pendingChoices).toHaveLength(0);
  });

  it("rejects declining a mandatory (non-optional) pending choice", () => {
    let { state, rng } = fresh(2);
    state = structuredClone(state);
    state.pendingChoices = [
      {
        id: "choice_mandatory",
        seat: 0,
        kind: "optional_ability",
        cardDefId: "ST01-001",
        optional: false,
        prompt: "Forced ability",
      },
    ];
    expect(listLegalIntents(state, 0)).toEqual([
      { type: "resolve_pending_choice", accept: true },
    ]);
    const declined = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: false },
      { seat: 0, rng },
    );
    expect(declined.ok).toBe(false);
    expect(declined.error?.code).toBe("mandatory_choice");
    const accepted = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng },
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.state.pendingChoices).toHaveLength(0);
  });
});

describe("life trigger (migrated to the pending-choice queue)", () => {
  function forceLifeTriggerAttack(seed: number): {
    state: MatchState;
    rng: ReturnType<typeof createSeededRng>;
  } {
    let { state, rng } = fresh(seed);
    state = act(state, 0, { type: "end_turn" }, rng);
    state = act(state, 1, { type: "end_turn" }, rng);
    state = structuredClone(state);
    // Force the defender's top Life card to a known trigger-bearing card.
    state.players[1].life[0] = "ST01-003";
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
    state = act(state, 1, { type: "pass_block" }, rng);
    state = act(state, 1, { type: "pass_counter" }, rng);
    return { state, rng };
  }

  it("can activate Rayleigh's On Play effect from a Life Trigger", () => {
    const { state, rng } = fresh(79);
    const next = structuredClone(state) as MatchState;
    next.phase = "damage";
    next.activeSeat = 0;
    next.players[1].leader.defId = "OP16-080";
    next.players[0].life = next.players[0].life.slice(0, 3);
    next.players[0].faceUpLife = next.players[0].faceUpLife.slice(0, 3);
    next.players[0].characters = [
      { id: "rayleigh_target", defId: "OP12-002", rested: false, attachedDonIds: [] },
    ];
    next.pendingChoices = [
      {
        id: "life_rayleigh",
        seat: 1,
        kind: "life_trigger",
        cardDefId: "OP14-108",
        optional: true,
        prompt: "Rayleigh Trigger",
        privateToSeat: 1,
      },
    ];
    const accepted = applyIntent(
      next,
      { type: "resolve_pending_choice", accept: true },
      { seat: 1, rng },
    );
    expect(accepted.ok, accepted.error?.message).toBe(true);
    expect(accepted.state.pendingChoices[0]?.abilityId).toBe("on_play_ko_power");
  });

  it("queues an accept/decline life-trigger choice naming the card", () => {
    const def = getCardDef("ST01-003");
    const originalTriggerDraw = def.triggerDraw;
    def.triggerDraw = 2;
    try {
      const { state } = forceLifeTriggerAttack(21);
      expect(state.phase).toBe("damage");
      expect(state.pendingChoices).toHaveLength(1);
      const choice = state.pendingChoices[0];
      expect(choice.kind).toBe("life_trigger");
      expect(choice.seat).toBe(1);
      expect(choice.cardDefId).toBe("ST01-003");
      expect(choice.optional).toBe(true);
      expect(choice.prompt).toMatch(/Karoo/);
      expect(getPlayerView(state, 1).pendingChoices[0]?.cardDefId).toBe("ST01-003");
      expect(getPlayerView(state, 0).pendingChoices[0]?.cardDefId).toBe("HIDDEN");
      expect(getPlayerView(state, 0).pendingTrigger).toEqual({ seat: 1, cardDefId: "HIDDEN" });
      expect(getSpectatorView(state, 1).pendingChoices[0]?.cardDefId).toBe("HIDDEN");
      expect(getSpectatorView(state, 1).pendingTrigger).toEqual({ seat: 1, cardDefId: "HIDDEN" });

      expect(listLegalIntents(state, 1)).toEqual([
        { type: "resolve_pending_choice", accept: true },
        { type: "resolve_pending_choice", accept: false },
      ]);
      expect(listLegalIntents(state, 0)).toEqual([]);
    } finally {
      def.triggerDraw = originalTriggerDraw;
    }
  });

  it("accepting resolves the trigger then trashes the Life card", () => {
    const def = getCardDef("ST01-003");
    const originalTriggerDraw = def.triggerDraw;
    def.triggerDraw = 2;
    try {
      const { state, rng } = forceLifeTriggerAttack(21);
      const handBefore = state.players[1].hand.length;
      const r = applyIntent(
        state,
        { type: "resolve_pending_choice", accept: true },
        { seat: 1, rng },
      );
      expect(r.ok).toBe(true);
      assertInvariants(r.state);
      expect(r.state.pendingChoices).toHaveLength(0);
      expect(r.state.phase).toBe("main");
      expect(r.state.battle).toBeNull();
      expect(r.state.players[1].hand.length).toBe(handBefore + 2);
      expect(r.state.players[1].trash).toContain("ST01-003");
      expect(r.events.some((e) => e.type === "drew" && e.count === 2)).toBe(true);
      expect(
        r.events.some((e) => e.type === "trigger_resolved" && e.accepted === true),
      ).toBe(true);
    } finally {
      def.triggerDraw = originalTriggerDraw;
    }
  });

  it("declining adds only the life card to hand (no draw)", () => {
    const def = getCardDef("ST01-003");
    const originalTriggerDraw = def.triggerDraw;
    def.triggerDraw = 2;
    try {
      const { state, rng } = forceLifeTriggerAttack(21);
      const handBefore = state.players[1].hand.length;
      const r = applyIntent(
        state,
        { type: "resolve_pending_choice", accept: false },
        { seat: 1, rng },
      );
      expect(r.ok).toBe(true);
      expect(r.state.pendingChoices).toHaveLength(0);
      expect(r.state.phase).toBe("main");
      expect(r.state.players[1].hand.length).toBe(handBefore + 1);
      expect(r.events.some((e) => e.type === "drew")).toBe(false);
      expect(
        r.events.some((e) => e.type === "trigger_resolved" && e.accepted === false),
      ).toBe(true);
    } finally {
      def.triggerDraw = originalTriggerDraw;
    }
  });
});

describe("On Play optional ability framework (mutated fixture)", () => {

  const jinbe = () => getCardDef("ST01-005");
  const prevDraw = jinbe().onPlayOptionalDraw;
  beforeEach(() => {
    jinbe().onPlayOptionalDraw = 1;
  });
  afterEach(() => {
    jinbe().onPlayOptionalDraw = prevDraw;
  });
  function playUsoppInMain(seed: number): {
    state: MatchState;
    rng: ReturnType<typeof createSeededRng>;
  } {
    let { state, rng } = fresh(seed);
    state = structuredClone(state);
    while (state.players[0].costArea.length < 3) {
      const don = state.players[0].donDeck.pop();
      if (!don) break;
      state.players[0].costArea.push(don);
    }
    for (const don of state.players[0].costArea) don.rested = false;
    state.players[0].hand = [
      { id: "h_usopp", defId: "ST01-005", rested: false, attachedDonIds: [] },
    ];
    const r = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(r.ok, r.error?.message).toBe(true);
    return { state: r.state, rng };
  }

  it("queues an On Play prompt naming the card and blocks other Main actions", () => {
    const { state, rng } = playUsoppInMain(3);
    expect(state.pendingChoices).toHaveLength(1);
    const choice = state.pendingChoices[0];
    expect(choice.kind).toBe("on_play");
    expect(choice.seat).toBe(0);
    expect(choice.cardDefId).toBe("ST01-005");
    expect(choice.optional).toBe(true);
    expect(choice.prompt).toMatch(/Jinbe/);
    expect(choice.sourceInstanceId).toBeTruthy();
    expect(state.phase).toBe("main");

    expect(listLegalIntents(state, 0)).toEqual([
      { type: "resolve_pending_choice", accept: true },
      { type: "resolve_pending_choice", accept: false },
    ]);

    const blocked = applyIntent(state, { type: "end_turn" }, { seat: 0, rng });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("pending_choice");
  });

  it("accepting draws a card and unblocks Main phase", () => {
    const { state, rng } = playUsoppInMain(3);
    const handBefore = state.players[0].hand.length;
    const r = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng },
    );
    expect(r.ok).toBe(true);
    assertInvariants(r.state);
    expect(r.state.pendingChoices).toHaveLength(0);
    expect(r.state.players[0].hand.length).toBe(handBefore + 1);
    expect(r.events.some((e) => e.type === "drew" && e.count === 1)).toBe(true);
    expect(
      r.events.some(
        (e) =>
          e.type === "pending_choice_resolved" &&
          e.kind === "on_play" &&
          e.accepted === true,
      ),
    ).toBe(true);
    // Main phase actions are legal again once the queue drains.
    const endTurn = applyIntent(r.state, { type: "end_turn" }, { seat: 0, rng });
    expect(endTurn.ok).toBe(true);
  });

  it("declining leaves the hand unchanged", () => {
    const { state, rng } = playUsoppInMain(3);
    const handBefore = state.players[0].hand.length;
    const r = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: false },
      { seat: 0, rng },
    );
    expect(r.ok).toBe(true);
    expect(r.state.pendingChoices).toHaveLength(0);
    expect(r.state.players[0].hand.length).toBe(handBefore);
    expect(r.events.some((e) => e.type === "drew")).toBe(false);
    expect(
      r.events.some(
        (e) =>
          e.type === "pending_choice_resolved" &&
          e.kind === "on_play" &&
          e.accepted === false,
      ),
    ).toBe(true);
  });
});
