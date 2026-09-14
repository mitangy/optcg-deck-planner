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
    assertInvariants(resolved.state);
    expect(resolved.state.players[0].deck[0]).toBe(toDeck);
    expect(resolved.state.players[0].costArea.length).toBeGreaterThan(8);
    expect(resolved.state.pendingChoices).toHaveLength(0);
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
});
