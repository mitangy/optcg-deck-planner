import { describe, expect, it } from "vitest";
import {
  applyIntent,
  createMatch,
  createSeededRng,
  ensureCardDef,
  getPlayerView,
  listLegalIntents,
} from "../index.js";
import type { CardInstance, MatchState } from "../types.js";

const deck = Array.from({ length: 20 }, () => "ST01-003");

function card(id: string, defId: string): CardInstance {
  return { id, defId, rested: false, attachedDonIds: [] };
}

function mainState(): MatchState {
  const state = createMatch({
    seed: 4,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: [...deck] },
      { leaderId: "ST01-001", deck: [...deck] },
    ],
  });
  state.phase = "main";
  state.activeSeat = 0;
  state.players[0].turnsStarted = 2;
  state.players[1].turnsStarted = 2;
  return state;
}

describe("conditional Rush and power modifiers", () => {
  it("negating Rush restores the attack restriction on a newly played Roger", () => {
    const state = mainState();
    const roger = { ...card("roger", "OP09-118"), summoningSick: true };
    state.players[0].characters = [roger];
    expect(listLegalIntents(state, 0).some((intent) => intent.type === "declare_attack" && intent.attackerId === roger.id)).toBe(true);
    state.players[0].characters[0]!.effectsNegatedThroughTurn = state.turnNumber;
    expect(listLegalIntents(state, 0).some((intent) => intent.type === "declare_attack" && intent.attackerId === roger.id)).toBe(false);
    expect(getPlayerView(state, 0).you.characters[0]?.rush).toBe(false);
    expect(getPlayerView(state, 0).you.characters[0]?.summoningSick).toBe(true);
  });

  it.each(["ST01-006", "ST23-001", "EB04-058", "OP09-093"])("%s gets Blocker through the registry and loses it under negation", (defId) => {
    const state = mainState();
    state.phase = "block";
    state.battle = { attackerSeat: 0, attackerId: state.players[0].leader.id, target: { kind: "leader" }, defenderPowerBonus: 0, attackerPowerBonus: 0 };
    state.players[1].characters = [card("blocker", defId)];
    expect(listLegalIntents(state, 1)).toContainEqual({ type: "declare_block", blockerId: "blocker" });
    state.players[1].characters[0]!.effectsNegatedThroughTurn = state.turnNumber;
    expect(listLegalIntents(state, 1)).not.toContainEqual({ type: "declare_block", blockerId: "blocker" });
  });

  it("OP16-118 replaces Counter with 2000 without stacking multiple Aces", () => {
    const state = mainState();
    state.phase = "counter";
    state.activeSeat = 0;
    state.battle = {
      attackerSeat: 0,
      attackerId: state.players[0].leader.id,
      target: { kind: "leader" },
      defenderPowerBonus: 0,
      attackerPowerBonus: 0,
    };
    state.players[1].characters = [card("ace_aura", "OP16-118"), card("ace_aura2", "OP16-118")];
    state.players[1].hand = [card("shiryuu_hand", "OP16-108")];
    expect(listLegalIntents(state, 1)).toContainEqual({ type: "counter_from_hand", handIndex: 0 });
    const result = applyIntent(state, { type: "counter_from_hand", handIndex: 0 }, { seat: 1, rng: createSeededRng(4) });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.state.battle?.defenderPowerBonus).toBe(2000);
  });

  it("hand-only power conditions do not recurse after Newgate and Uta enter the field", () => {
    const state = mainState();
    state.players[0].characters = [card("uta", "ST23-001"), card("newgate", "OP17-005")];
    state.players[1].characters = [card("other_newgate", "OP17-005")];
    expect(() => getPlayerView(state, 0)).not.toThrow();
    expect(() => listLegalIntents(state, 0)).not.toThrow();
  });

  it("Teach modifies friendly field cost on the opponent turn without changing hand cost", () => {
    const state = mainState();
    state.players[1].leader.defId = "OP16-080";
    state.players[1].characters = [card("karoo_field", "ST01-003")];
    state.players[1].hand = [card("karoo_hand", "ST01-003")];
    expect(getPlayerView(state, 1).you.characters[0]?.fieldCost).toBe(2);
    state.pendingChoices = [{ id: "doc_q", seat: 0, kind: "optional_ability", cardDefId: "OP16-109", optional: true, prompt: "K.O. cost 1", abilityId: "on_ko_ko_opponent_cost" }];
    const rejected = applyIntent(state, { type: "resolve_pending_choice", accept: true, targetIds: ["karoo_field"] }, { seat: 0, rng: createSeededRng(4) });
    expect(rejected.ok).toBe(false);
    expect(rejected.error?.code).toBe("bad_target");
    state.pendingChoices = [];
    state.activeSeat = 1;
    expect(getPlayerView(state, 1).you.hand[0]?.playCost).toBe(1);
    expect(getPlayerView(state, 1).you.characters[0]?.fieldCost).toBe(1);
  });

  it("ST01-004 Sanji gains Rush only while it has at least 2 attached DON!!", () => {
    const state = mainState();
    const sanji = card("sanji_1", "ST01-004");
    sanji.summoningSick = true;
    state.players[0].characters = [sanji];
    expect(
      listLegalIntents(state, 0).some(
        (intent) => intent.type === "declare_attack" && intent.attackerId === sanji.id,
      ),
    ).toBe(false);
    expect(getPlayerView(state, 0).you.characters[0]?.rush).toBe(false);

    sanji.attachedDonIds = ["attached_1", "attached_2"];
    expect(
      listLegalIntents(state, 0).some(
        (intent) => intent.type === "declare_attack" && intent.attackerId === sanji.id,
      ),
    ).toBe(true);
    const view = getPlayerView(state, 0).you.characters[0]!;
    expect(view.rush).toBe(true);
    expect(view.summoningSick).toBe(false);
    expect(view.power).toBe(6000);
  });

  it("OP17-002 Atmos gains +3000 only during its opponent's turn", () => {
    const state = mainState();
    state.players[1].characters = [card("atmos_1", "OP17-002")];
    expect(getPlayerView(state, 0).opponent.characters[0]?.power).toBe(9000);
    state.activeSeat = 1;
    expect(getPlayerView(state, 1).you.characters[0]?.power).toBe(6000);
  });

  it("ST01-005 Jinbe buffs another friendly card through the current turn", () => {
    const state = mainState();
    const jinbe = card("jinbe_1", "ST01-005");
    jinbe.attachedDonIds = ["attached_1"];
    state.players[0].characters = [jinbe];
    const attacked = applyIntent(
      state,
      { type: "declare_attack", attackerId: "jinbe_1", target: { kind: "leader" } },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(attacked.ok, attacked.error?.message).toBe(true);
    expect(attacked.state.pendingChoices[0]?.abilityId).toBe("jinbe_attack_power");
    expect(listLegalIntents(attacked.state, 0)).toEqual([
      { type: "resolve_pending_choice", accept: true },
    ]);

    const resolved = applyIntent(
      attacked.state,
      {
        type: "resolve_pending_choice",
        accept: true,
        buffTargetId: attacked.state.players[0].leader.id,
      },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(getPlayerView(resolved.state, 0).you.leader.power).toBe(6000);
    expect(
      resolved.events.some(
        (event) => event.type === "power_buff_applied" && event.amount === 1000,
      ),
    ).toBe(true);

    resolved.state.phase = "main";
    resolved.state.battle = null;
    const ended = applyIntent(
      resolved.state,
      { type: "end_turn" },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(ended.ok).toBe(true);
    expect(getPlayerView(ended.state, 0).you.leader.power).toBe(5000);
  });

  it("Jinbe can choose zero targets but cannot target itself", () => {
    const state = mainState();
    const jinbe = card("jinbe_1", "ST01-005");
    jinbe.attachedDonIds = ["attached_1"];
    state.players[0].characters = [jinbe];
    const attacked = applyIntent(
      state,
      { type: "declare_attack", attackerId: "jinbe_1", target: { kind: "leader" } },
      { seat: 0, rng: createSeededRng(4) },
    );
    const skipped = applyIntent(
      attacked.state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(skipped.ok).toBe(true);

    const attackedAgain = structuredClone(attacked.state);
    const invalid = applyIntent(
      attackedAgain,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "jinbe_1" },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.error?.code).toBe("bad_target");
  });

  it("Jinbe does not trigger without its printed attached DON!! requirement", () => {
    const state = mainState();
    state.players[0].characters = [card("jinbe_1", "ST01-005")];
    const attacked = applyIntent(state, { type: "declare_attack", attackerId: "jinbe_1", target: { kind: "leader" } }, { seat: 0, rng: createSeededRng(4) });
    expect(attacked.ok).toBe(true);
    expect(attacked.state.pendingChoices.some((choice) => choice.abilityId === "jinbe_attack_power")).toBe(false);
  });

  it("OP17-112 makes friendly 4000-power Trigger Characters base 8000 on your turn", () => {
    ensureCardDef("OP15-103");
    const state = mainState();
    const linlin = card("linlin_1", "OP17-112");
    const genbo = card("genbo_1", "OP15-103");
    genbo.attachedDonIds = ["attached_1"];
    state.players[0].characters = [linlin, genbo];

    expect(getPlayerView(state, 0).you.characters[1]?.power).toBe(9000);

    state.activeSeat = 1;
    expect(getPlayerView(state, 1).opponent.characters[1]?.power).toBe(4000);
  });

  it("OP17-112 neither affects non-qualifying Characters nor stacks", () => {
    const state = mainState();
    state.players[0].characters = [
      card("linlin_1", "OP17-112"),
      card("linlin_2", "OP17-112"),
      card("devon_1", "OP16-104"),
      card("baby5_1", "OP12-112"),
    ];

    const characters = getPlayerView(state, 0).you.characters;
    expect(characters.find((entry) => entry.id === "devon_1")?.power).toBe(3000);
    expect(characters.find((entry) => entry.id === "baby5_1")?.power).toBe(5000);
  });

  it("OP09-086 gains +1000 for each complete four-card trash group under Blackbeard", () => {
    const state = mainState();
    state.players[0].leader.defId = "OP16-080";
    state.players[0].characters = [card("burgess_1", "OP09-086")];
    state.players[0].trash = [
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-003",
    ];

    expect(getPlayerView(state, 0).you.characters[0]?.power).toBe(7000);
    state.players[0].leader = card("leader_1", "ST01-001");
    expect(getPlayerView(state, 0).you.characters[0]?.power).toBe(5000);
  });

  it("OP17-003 Rush: Character cannot attack a Leader while newly played", () => {
    const state = mainState();
    const izo = card("izo_1", "OP17-003");
    izo.summoningSick = true;
    state.players[0].characters = [izo];
    state.players[1].characters = [{ ...card("target_1", "OP17-002"), rested: true }];

    expect(
      listLegalIntents(state, 0).some(
        (intent) => intent.type === "declare_attack" && intent.attackerId === izo.id && intent.target.kind === "leader",
      ),
    ).toBe(false);
    expect(
      listLegalIntents(state, 0).some(
        (intent) => intent.type === "declare_attack" && intent.attackerId === izo.id && intent.target.kind === "character",
      ),
    ).toBe(true);
    const leaderAttack = applyIntent(
      state,
      { type: "declare_attack", attackerId: izo.id, target: { kind: "leader" } },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(leaderAttack.ok).toBe(false);
    expect(leaderAttack.error?.code).toBe("rush_character_only");
  });

  it("OP17-003 On Play can reduce one rested opponent Character by 6000", () => {
    const state = mainState();
    state.players[0].leader.defId = "OP17-001";
    state.players[0].costArea = Array.from({ length: 4 }, (_, i) => ({
      id: `don_${i}`,
      rested: false,
      attachedTo: null,
    }));
    state.players[0].hand = [card("izo_hand", "OP17-003")];
    state.players[1].characters = [{ ...card("target_1", "OP17-002"), rested: true }];
    const played = applyIntent(
      state,
      { type: "play_card", handIndex: 0 },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_power_debuff");
    const resolved = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "target_1" },
      { seat: 0, rng: createSeededRng(4) },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(getPlayerView(resolved.state, 1).you.characters[0]?.power).toBe(3000);
  });
});

