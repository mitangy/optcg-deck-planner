import { describe, expect, it } from "vitest";
import { buildTestDeck } from "../cards/definitions.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { MatchState, Seat } from "../types.js";

function fresh(seed = 1) {
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

function withActiveDons(state: MatchState, seat: Seat, n: number): MatchState {
  const next = structuredClone(state) as MatchState;
  const p = next.players[seat];
  p.costArea = Array.from({ length: n }, (_, i) => ({
    id: `don_test_${seat}_${i}`,
    rested: false,
    attachedTo: null,
  }));
  return next;
}

describe("On Play — Charlotte Linlin / Borsalino hooks", () => {
  it("EB03-034 draws, prompts hand→deck, then adds active DON!!", () => {
    const { rng } = fresh(7);
    let state = withActiveDons(fresh(7).state, 0, 8);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_linlin", defId: "EB03-034", rested: false, attachedDonIds: [] },
      { id: "h_extra", defId: "ST01-003", rested: false, attachedDonIds: [] },
    ];

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.players[0].characters.some((c) => c.defId === "EB03-034")).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_hand_to_deck");
    expect(played.events.some((e) => e.type === "drew" && e.count === 1)).toBe(true);
    const toDeck = played.state.players[0].hand[0]!.defId;

    const resolved = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, handIndex: 0 },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].deck[0]).toBe(toDeck);
    expect(resolved.state.pendingChoices[0]?.abilityId).toBe("on_play_add_active_don");

    const donAdded = applyIntent(
      resolved.state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng },
    );
    expect(donAdded.ok, donAdded.error?.message).toBe(true);
    assertInvariants(donAdded.state);
    expect(donAdded.state.players[0].costArea.length).toBeGreaterThan(8);
    expect(donAdded.state.pendingChoices).toHaveLength(0);
  });

  it("EB03-034 hand→deck prompt has no bare accept for turn timers", () => {
    const { rng } = fresh(8);
    let state = withActiveDons(fresh(8).state, 0, 8);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_linlin", defId: "EB03-034", rested: false, attachedDonIds: [] },
      { id: "h_extra", defId: "ST01-003", rested: false, attachedDonIds: [] },
    ];
    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    const legal = listLegalIntents(played.state, 0);
    expect(
      legal.some((i) => i.type === "resolve_pending_choice" && i.accept),
    ).toBe(false);
  });

  it("OP17-112 draws then can add deck top to Life", () => {
    const { rng } = fresh(11);
    let state = withActiveDons(fresh(11).state, 0, 10);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_linlin", defId: "OP17-112", rested: false, attachedDonIds: [] },
    ];
    const lifeBefore = state.players[0].life.length;
    const deckTop = state.players[0].deck[0];

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_life_choice");

    const resolved = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, onPlayChoice: "own_life" },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].life.length).toBe(lifeBefore + 1);
    expect(resolved.state.players[0].life[0]).toBe(deckTop);
  });

  it("EB04-058 Borsalino offers Life add when at ≤2 Life", () => {
    const { rng } = fresh(5);
    let state = withActiveDons(fresh(5).state, 0, 5);
    state = structuredClone(state);
    state.players[0].life = state.players[0].life.slice(0, 2);
    state.players[0].faceUpLife = state.players[0].faceUpLife.slice(0, 2);
    state.players[0].hand = [
      { id: "h_bors", defId: "EB04-058", rested: false, attachedDonIds: [] },
    ];

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_add_life");
    expect(listLegalIntents(played.state, 0)).toEqual([
      { type: "resolve_pending_choice", accept: true },
      { type: "resolve_pending_choice", accept: false },
    ]);
  });

  it("OP16-119 places one of the top three cards into Life", () => {
    const { rng } = fresh(19);
    let state = withActiveDons(fresh(19).state, 0, 8);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_teach", defId: "OP16-119", rested: false, attachedDonIds: [] },
    ];
    const topThree = state.players[0].deck.slice(0, 3);
    const lifeBefore = state.players[0].life.length;
    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.kind).toBe("search_top_deck");
    const choice = played.state.pendingChoices[0]!;
    const selected = choice.search!.options.find((option) => option.defId === topThree[1]);
    expect(selected).toBeTruthy();
    const remainder = choice.search!.options.filter((option) => option.id !== selected!.id);
    const resolved = applyIntent(
      played.state,
      {
        type: "resolve_pending_choice",
        accept: true,
        selectedOptionId: selected!.id,
        orderedOptionIds: remainder.map((option) => option.id),
      },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].life.length).toBe(lifeBefore + 1);
    expect(resolved.state.players[0].life[0]).toBe(topThree[1]);
    expect(resolved.state.players[0].deck.slice(0, 2)).toEqual(state.players[0].deck.slice(3, 5));
  });

  it("OP14-108 K.O.s an eligible opponent Character under its leader and Life conditions", () => {
    const { rng } = fresh(20);
    let state = withActiveDons(fresh(20).state, 0, 7);
    state = structuredClone(state);
    state.players[0].leader.defId = "OP16-080";
    state.players[1].life = state.players[1].life.slice(0, 3);
    state.players[1].faceUpLife = state.players[1].faceUpLife.slice(0, 3);
    state.players[1].characters = [
      { id: "rayleigh_target", defId: "OP12-002", rested: false, attachedDonIds: [] },
    ];
    state.players[0].hand = [
      { id: "h_rayleigh", defId: "OP14-108", rested: false, attachedDonIds: [] },
    ];
    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_ko_power");
    const resolved = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, buffTargetId: "rayleigh_target" },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[1].characters).toHaveLength(0);
    expect(resolved.state.players[1].trash).toContain("OP12-002");
  });

  it("OP16-108 can trade a hand card for a low-cost Trigger card from trash to Life", () => {
    const { rng } = fresh(21);
    let state = withActiveDons(fresh(21).state, 0, 7);
    state = structuredClone(state);
    state.players[0].leader.defId = "OP16-080";
    state.players[0].trash = ["OP09-096"];
    state.players[0].hand = [
      { id: "h_shiryu", defId: "OP16-108", rested: false, attachedDonIds: [] },
      { id: "h_cost", defId: "ST01-003", rested: false, attachedDonIds: [] },
    ];
    const lifeBefore = state.players[0].life.length;
    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_trash_hand_to_life");
    const resolved = applyIntent(
      played.state,
      {
        type: "resolve_pending_choice",
        accept: true,
        handIndex: 0,
        selectedTrashOptionId: played.state.pendingChoices[0]!.trashOptions!.find((option) => option.defId === "OP09-096")!.id,
      },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].life.length).toBe(lifeBefore + 1);
    expect(resolved.state.players[0].life[0]).toBe("OP09-096");
    expect(resolved.state.players[0].faceUpLife[0]).toBe(true);
    expect(resolved.state.players[0].trash).toContain("ST01-003");
  });

  it("ST30-004 reveals two 6000-power Characters, draws three, then trashes two", () => {
    const { rng } = fresh(22);
    let state = withActiveDons(fresh(22).state, 0, 1);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_ivankov", defId: "ST30-004", rested: false, attachedDonIds: [] },
      { id: "h_jozu_1", defId: "ST30-005", rested: false, attachedDonIds: [] },
      { id: "h_jozu_2", defId: "ST30-005", rested: false, attachedDonIds: [] },
    ];

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("on_play_reveal_draw_trash");

    const revealed = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, handIndices: [0, 1] },
      { seat: 0, rng },
    );
    expect(revealed.ok, revealed.error?.message).toBe(true);
    expect(revealed.state.players[0].hand).toHaveLength(5);
    expect(revealed.state.pendingChoices[0]?.abilityId).toBe("discard_hand_count");

    const discardedDefIds = revealed.state.players[0].hand.slice(0, 2).map((card) => card.defId);
    const discarded = applyIntent(
      revealed.state,
      { type: "resolve_pending_choice", accept: true, handIndices: [0, 1] },
      { seat: 0, rng },
    );
    expect(discarded.ok, discarded.error?.message).toBe(true);
    expect(discarded.state.players[0].hand).toHaveLength(3);
    expect(discarded.state.pendingChoices).toHaveLength(0);
    expect(discarded.state.players[0].trash).toEqual(expect.arrayContaining(discardedDefIds));
    assertInvariants(discarded.state);
  });

  it("OP16-116 plays a Teach from hand and then moves opponent Life to hand", () => {
    const { rng } = fresh(23);
    let state = withActiveDons(fresh(23).state, 0, 10);
    state = structuredClone(state);
    state.players[0].hand = [
      { id: "h_zehaha", defId: "OP16-116", rested: false, attachedDonIds: [] },
      { id: "h_teach", defId: "OP16-119", rested: false, attachedDonIds: [] },
    ];
    const opponentLifeBefore = state.players[1].life.length;
    const opponentHandBefore = state.players[1].hand.length;

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("main_play_named_character");

    const teachPlayed = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, handIndex: 0 },
      { seat: 0, rng },
    );
    expect(teachPlayed.ok, teachPlayed.error?.message).toBe(true);
    expect(teachPlayed.state.players[0].characters.some((card) => card.defId === "OP16-119")).toBe(true);
    expect(teachPlayed.state.pendingChoices[0]?.abilityId).toBe("main_opponent_life_to_hand");
    expect(teachPlayed.state.pendingChoices[1]?.kind).toBe("search_top_deck");

    const lifeTaken = applyIntent(
      teachPlayed.state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng },
    );
    expect(lifeTaken.ok, lifeTaken.error?.message).toBe(true);
    expect(lifeTaken.state.players[1].life).toHaveLength(opponentLifeBefore - 1);
    expect(lifeTaken.state.players[1].hand).toHaveLength(opponentHandBefore + 1);
    expect(lifeTaken.state.pendingChoices[0]?.kind).toBe("search_top_deck");
    assertInvariants(lifeTaken.state);
  });

  it("OP16-115 lets its controller choose which non-self Trigger card returns from trash", () => {
    const { rng } = fresh(24);
    let state = withActiveDons(fresh(24).state, 0, 1);
    state = structuredClone(state);
    state.players[0].leader.defId = "OP16-080";
    state.players[0].trash = ["OP16-116", "OP12-112"];
    state.players[0].hand = [
      { id: "h_vortex", defId: "OP16-115", rested: false, attachedDonIds: [] },
    ];

    const played = applyIntent(state, { type: "play_card", handIndex: 0 }, { seat: 0, rng });
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.pendingChoices[0]?.abilityId).toBe("main_trash_trigger_to_hand");

    const resolved = applyIntent(
      played.state,
      { type: "resolve_pending_choice", accept: true, selectedTrashOptionId: played.state.pendingChoices[0]!.trashOptions!.find((option) => option.defId === "OP12-112")!.id },
      { seat: 0, rng },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].hand.some((card) => card.defId === "OP12-112")).toBe(true);
    expect(resolved.state.players[0].trash).toContain("OP16-116");
  });
});
