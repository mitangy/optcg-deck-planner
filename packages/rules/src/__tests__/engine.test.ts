import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { applyIntent, assertInvariants, createMatch, getPlayerView, getSpectatorView, listLegalIntents, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { projectGameEvents } from "../engine/views.js";
import { deserializeMatch, serializeMatch, IncompatibleSnapshotError } from "../state/snapshot.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, MatchState, Seat } from "../types.js";

function fresh(seed = 1) {
  const rng = createSeededRng(seed);
  const deck = buildTestDeck(20);
  let state = createMatch({ seed, firstSeat: 0, players: [{ leaderId: DEFAULT_LEADER_ID, deck: [...deck] }, { leaderId: DEFAULT_LEADER_ID, deck: [...deck] }] });
  state = skipMulligans(state, rng);
  return { state, rng };
}

function act(state: MatchState, seat: Seat, intent: Intent, rng: ReturnType<typeof createSeededRng>): MatchState {
  const r = applyIntent(state, intent, { seat, rng });
  expect(r.ok, r.error?.message).toBe(true);
  assertInvariants(r.state);
  return r.state;
}

describe("match setup and mulligan", () => {
  it("sets Life from the Leader after mulligans and is deterministic per seed", () => {
    const a = fresh(42).state;
    const b = fresh(42).state;
    expect(a.phase).toBe("main");
    expect(a.players[0].life.length).toBe(5);
    expect(a.players[0].hand.length).toBe(5);
    expect(a.players[0].hand.map((c) => c.defId)).toEqual(b.players[0].hand.map((c) => c.defId));
  });

  it("offers keep/mulligan and redraws five", () => {
    const rng = createSeededRng(12);
    let state = createMatch({ seed: 12, firstSeat: 0, players: [{ leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }, { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }] });
    expect(listLegalIntents(state, 0)).toEqual([{ type: "mulligan", doMulligan: false }, { type: "mulligan", doMulligan: true }]);
    state = act(state, 0, { type: "mulligan", doMulligan: true }, rng);
    expect(state.players[0].hand.length).toBe(5);
    expect(state.phase).toBe("mulligan");
    state = act(state, 1, { type: "mulligan", doMulligan: false }, rng);
    expect(state.phase).toBe("main");
  });
});

describe("turn structure", () => {
  it("first player gets 1 DON!!, skips the draw and cannot attack on turn 1", () => {
    const { state } = fresh(7);
    expect(state.players[0].costArea.length).toBe(1);
    expect(state.players[0].hand.length).toBe(5);
    expect(listLegalIntents(state, 0).some((i) => i.type === "declare_attack")).toBe(false);
  });

  it("second player gets 2 DON!!, draws, and cannot attack on their first turn", () => {
    let { state, rng } = fresh(7);
    state = act(state, 0, { type: "end_turn" }, rng);
    expect(state.activeSeat).toBe(1);
    expect(state.players[1].costArea.length).toBe(2);
    expect(state.players[1].hand.length).toBe(6);
    expect(listLegalIntents(state, 1).some((i) => i.type === "declare_attack")).toBe(false);
  });

  it("refresh returns attached DON!! and untaps cards", () => {
    const h = new Harness();
    const [ch] = h.field(0, FILLER);
    h.don(0, 2);
    h.act(0, { type: "give_don", donId: h.state.players[0].costArea[0]!.id, targetId: ch!.id });
    expect(h.view(0).you.characters[0]!.power).toBe(4000);
    // Rest the Character and the remaining DON!! so the refresh has something to untap.
    ch!.rested = true;
    h.state.players[0].costArea[0]!.rested = true;
    h.act(0, { type: "end_turn" });
    expect(h.view(1).opponent.characters[0]!.power).toBe(3000);
    h.act(1, { type: "end_turn" });
    expect(h.state.players[0].attachedDons.length).toBe(0);
    // 2 from before (the returned attached DON!! and the rested one) + 2 placed this DON!! Phase.
    expect(h.state.players[0].costArea.length).toBe(4);
    expect(h.state.players[0].costArea.every((d) => !d.rested)).toBe(true);
    expect(h.state.players[0].characters[0]!.rested).toBe(false);
  });

  it("a player with an empty deck loses during rule processing", () => {
    const h = new Harness();
    const p = h.state.players[0];
    p.deck = [];
    p.zoneInstanceIds.deck = [];
    h.don(0, 1);
    // Any action settles the game; no draw is involved, so only rule processing can end it.
    h.act(0, { type: "give_don", donId: p.costArea[0]!.id, targetId: p.leader.id });
    expect(h.state.winner).toBe(1);
    expect(h.state.winReason).toBe("deck_out");
  });
});

describe("playing cards and DON!!", () => {
  it("pays by resting active DON!! and marks the Character as played this turn", () => {
    const h = new Harness();
    h.hand(0, FILLER);
    h.don(0, 3);
    h.play(0, FILLER);
    const card = h.state.players[0].characters.at(-1)!;
    expect(card.summoningSick).toBe(true);
    expect(card.playedTurn).toBe(h.state.turnNumber);
    expect(h.state.players[0].costArea.filter((d) => !d.rested).length).toBe(2);
  });

  it("rejects a play without enough DON!! and leaves state untouched", () => {
    const h = new Harness();
    h.hand(0, "OP16-119");
    h.don(0, 2);
    const before = JSON.stringify(h.state);
    const r = h.try(0, { type: "play_card", handIndex: 0 });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(h.state)).toBe(before);
    expect(r.state.rng).toEqual(h.state.rng);
  });

  it("requires trashing a Character to play a sixth", () => {
    const h = new Harness();
    const five = h.field(0, FILLER, FILLER, FILLER, FILLER, FILLER);
    h.hand(0, FILLER);
    h.don(0, 5);
    expect(h.try(0, { type: "play_card", handIndex: 0 }).ok).toBe(false);
    h.play(0, FILLER, { trashCharacterId: five[0]!.id });
    expect(h.state.players[0].characters.length).toBe(5);
    expect(h.state.players[0].trash).toContain(FILLER);
  });
});

describe("battle", () => {
  it("leader damage at 0 Life ends the game", () => {
    const h = new Harness();
    h.life(1);
    h.attack(h.state.players[0].leader, "leader").passBattle();
    expect(h.state.winner).toBe(0);
    expect(h.state.winReason).toBe("leader_battle_at_zero_life");
  });

  it("damage moves the top Life card to hand; ties favor the attacker", () => {
    const h = new Harness();
    h.life(1, FILLER, FILLER);
    h.attack(h.state.players[0].leader, "leader").passBattle();
    expect(h.state.players[1].life.length).toBe(1);
    expect(h.state.players[1].hand.length).toBe(1);
    expect(h.state.phase).toBe("main");
  });

  it("K.O.s a rested Character that loses a battle", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    target!.rested = true;
    h.attack(h.state.players[0].leader, target!).passBattle();
    expect(h.state.players[1].characters.length).toBe(0);
    expect(h.state.players[1].trash).toContain(FILLER);
  });

  it("cannot attack active Characters", () => {
    const h = new Harness();
    const [target] = h.field(1, FILLER);
    expect(h.try(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "character", instanceId: target!.id } }).ok).toBe(false);
  });

  it("Blocker redirects the attack and Counter cards add power this battle", () => {
    const h = new Harness();
    const [blocker] = h.field(1, "ST01-006");
    h.hand(1, "ST01-008");
    h.attack(h.state.players[0].leader, "leader");
    expect(h.legal(1)).toContainEqual({ type: "declare_block", blockerId: blocker!.id });
    h.act(1, { type: "declare_block", blockerId: blocker!.id });
    expect(h.state.phase).toBe("counter");
    const before = h.view(1).you.characters[0]!.power;
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    expect(h.view(1).you.characters[0]!.power).toBe(before + 1000);
    h.act(1, { type: "pass_counter" });
    // The blocker (1000 + 1000 Counter) still loses to the 5000 Leader.
    expect(h.state.players[1].characters.length).toBe(0);
    expect(h.state.players[1].trash).toEqual(expect.arrayContaining(["ST01-006", "ST01-008"]));
    expect(h.state.battle).toBeNull();
    expect(h.state.players[1].life.length).toBe(5);
  });
});

describe("privacy", () => {
  it("hides the opponent hand and Life; spectators see no hands", () => {
    const { state } = fresh(5);
    const view = getPlayerView(state, 0);
    expect(view.opponent.handCount).toBe(5);
    expect((view.opponent as { hand?: unknown }).hand).toBeUndefined();
    const spectator = getSpectatorView(state, 0);
    expect(spectator.you.hand).toEqual([]);
    expect(spectator.legalIntents).toEqual([]);
  });

  it("redacts private look options for the opponent and spectators", () => {
    const h = new Harness();
    h.hand(0, "OP01-016");
    h.don(0, 1);
    h.deckTop(0, "OP01-013", "OP01-014", "OP01-015", "OP01-017", "OP01-025");
    h.play(0, "OP01-016");
    const own = h.view(0).pendingChoices[0]!;
    const opp = h.view(1).pendingChoices[0]!;
    const spectator = getSpectatorView(h.state, 1).pendingChoices[0]!;
    expect(own.request?.type).toBe("look");
    expect((own.request as { options: { defId?: string }[] }).options[0]!.defId).toBe("OP01-013");
    type LookView = { options: { defId?: string; eligible: boolean }[]; groups: { eligibleIds: string[] }[] };
    // The owner sees which cards the search filter allows.
    expect((own.request as LookView).groups.some((g) => g.eligibleIds.length > 0)).toBe(true);
    for (const view of [opp, spectator]) {
      expect((view.request as LookView).options.every((o) => o.defId === "HIDDEN" && !o.eligible)).toBe(true);
      // Filter matches would reveal properties of face-down cards.
      expect((view.request as LookView).groups.every((g) => g.eligibleIds.length === 0)).toBe(true);
      expect(view.bindings).toBeUndefined();
      expect(view.resolutionFrameId).toBeUndefined();
    }
  });
});

describe("hidden-information leaks", () => {
  it("does not reveal how many hidden cards matched a private select (OP16-080 trash a [Trigger] card)", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    h.field(1, "OP09-095");
    h.hand(1, "ST01-014", "ST01-014", FILLER);
    h.attack(h.state.players[0].leader, "leader");
    h.accept(1);
    const own = h.view(1).pendingChoices[0]!;
    expect(own.request?.type).toBe("select");
    expect((own.request as { options: unknown[] }).options.length).toBe(2);
    for (const view of [h.view(0).pendingChoices[0]!, getSpectatorView(h.state, 0).pendingChoices[0]!]) {
      const request = view.request as { options: unknown[]; min: number; max: number };
      expect(request.options).toEqual([]);
      expect([request.min, request.max]).toEqual([0, 0]);
      expect(view.optionCount).toBeUndefined();
      expect(view.prompt).not.toMatch(/\d/);
    }
  });

  it("does not reveal a card a private look places face-down in Life (OP16-119)", () => {
    const h = new Harness();
    h.hand(0, "OP16-119");
    h.don(0, 8);
    h.deckTop(0, "OP01-013", FILLER, FILLER);
    h.play(0, "OP16-119");
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"], orderedOptionIds: ["o1", "o2"] });
    expect(h.state.players[0].life[0]).toBe("OP01-013");
    for (const viewer of [1, null] as const) {
      expect(JSON.stringify(projectGameEvents(h.state.lastEvents, viewer))).not.toContain("OP01-013");
    }
  });
});

describe("snapshots", () => {
  it("round-trips a paused choice and resumes identically", () => {
    const h = new Harness();
    h.hand(0, "OP01-016");
    h.don(0, 1);
    h.deckTop(0, "OP01-013", "OP01-014", "OP01-015", "OP01-017", "OP01-025");
    h.play(0, "OP01-016");
    const restored = deserializeMatch(serializeMatch(h.state));
    const choice = h.choice!;
    const answer: Intent = { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"], orderedOptionIds: ["o1", "o2", "o3", "o4"] };
    const direct = applyIntent(h.state, answer, { seat: 0, rng: h.rng });
    const resumed = applyIntent(restored, answer, { seat: 0, rng: h.rng });
    expect(choice.request?.type).toBe("look");
    expect(direct.ok).toBe(true);
    expect(resumed.state).toEqual(direct.state);
  });

  it("rejects snapshots from another registry or version", () => {
    const h = new Harness();
    expect(() => deserializeMatch(JSON.stringify({ ...h.state, registryHash: "fnv1a:00000000" }))).toThrow(IncompatibleSnapshotError);
    expect(() => deserializeMatch(JSON.stringify({ ...h.state, stateVersion: 2 }))).toThrow(IncompatibleSnapshotError);
  });
});
