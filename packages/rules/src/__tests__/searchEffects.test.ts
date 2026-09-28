import { describe, expect, it } from "vitest";
import {
  ABILITY_FULLALEAD_SEARCH,
  ABILITY_LAFFITTE_SEARCH,
  applyIntent,
  createMatch,
  createSeededRng,
  getPlayerView,
  getSpectatorView,
  listLegalIntents,
  projectGameEvents,
} from "../index.js";
import { ensureCardDef } from "../cards/definitions.js";
import type { CardInstance, MatchState, Seat } from "../types.js";

const filler = Array.from({ length: 20 }, () => "ST01-003");

function card(id: string, defId: string): CardInstance {
  return { id, defId, rested: false, attachedDonIds: [] };
}

function mainState(leaderId = "OP16-080"): MatchState {
  const state = createMatch({
    seed: 1,
    firstSeat: 0,
    players: [
      { leaderId, deck: [...filler] },
      { leaderId: "ST01-001", deck: [...filler] },
    ],
  });
  state.phase = "main";
  state.activeSeat = 0;
  state.players[0].mulliganDone = true;
  state.players[1].mulliganDone = true;
  state.players[0].costArea = [
    { id: "don_1", rested: false, attachedTo: null },
    { id: "don_2", rested: false, attachedTo: null },
  ];
  return state;
}

function resolveSearch(
  state: MatchState,
  selectedOptionId?: string,
  reverse = false,
) {
  const choice = state.pendingChoices[0]!;
  const remaining = choice.search!.options
    .filter((option) => option.id !== selectedOptionId)
    .map((option) => option.id);
  if (reverse) remaining.reverse();
  return applyIntent(
    state,
    {
      type: "resolve_pending_choice",
      accept: true,
      selectedOptionId,
      orderedOptionIds: remaining,
    },
    { seat: 0, rng: createSeededRng(1) },
  );
}

describe("private top-deck search effects", () => {
  it("Laffitte pays its costs, takes an eligible card, and orders the remainder", () => {
    const state = mainState();
    const laffitte = card("laffitte_1", "OP09-095");
    state.players[0].characters = [laffitte];
    state.players[0].deck = ["ST01-003", "OP09-086", "ST01-008", "OP09-099", "ST01-009", "ST01-006"];

    expect(listLegalIntents(state, 0)).toContainEqual({
      type: "activate_ability",
      sourceId: laffitte.id,
      abilityId: ABILITY_LAFFITTE_SEARCH,
    });
    const activated = applyIntent(
      state,
      { type: "activate_ability", sourceId: laffitte.id, abilityId: ABILITY_LAFFITTE_SEARCH },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(activated.ok, activated.error?.message).toBe(true);
    expect(activated.state.players[0].characters[0]!.rested).toBe(true);
    expect(activated.state.players[0].costArea.filter((don) => don.rested)).toHaveLength(1);
    const choice = activated.state.pendingChoices[0]!;
    expect(choice.kind).toBe("search_top_deck");
    expect(choice.search?.options).toHaveLength(5);

    const selected = choice.search!.options.find((option) => option.defId === "OP09-086")!;
    const resolved = resolveSearch(activated.state, selected.id, true);
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].hand.some((entry) => entry.defId === "OP09-086")).toBe(true);
    expect(resolved.state.players[0].deck).toEqual([
      "ST01-006",
      "ST01-009",
      "OP09-099",
      "ST01-008",
      "ST01-003",
    ]);
  });

  it("rejects an ineligible or incomplete search response without mutating state", () => {
    const state = mainState();
    state.players[0].characters = [card("laffitte_1", "OP09-095")];
    state.players[0].deck = ["ST01-003", "OP09-086", "ST01-008"];
    const activated = applyIntent(
      state,
      { type: "activate_ability", sourceId: "laffitte_1", abilityId: ABILITY_LAFFITTE_SEARCH },
      { seat: 0, rng: createSeededRng(1) },
    );
    const before = structuredClone(activated.state);
    const badOption = activated.state.pendingChoices[0]!.search!.options[0]!;
    const rejected = applyIntent(
      activated.state,
      {
        type: "resolve_pending_choice",
        accept: true,
        selectedOptionId: badOption.id,
        orderedOptionIds: [],
      },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.error?.code).toBe("bad_search_choice");
    expect(rejected.state).toEqual(before);
  });

  it("reveals candidates only to the choosing player", () => {
    const state = mainState();
    state.players[0].characters = [card("laffitte_1", "OP09-095")];
    const activated = applyIntent(
      state,
      { type: "activate_ability", sourceId: "laffitte_1", abilityId: ABILITY_LAFFITTE_SEARCH },
      { seat: 0, rng: createSeededRng(1) },
    ).state;

    expect(getPlayerView(activated, 0).pendingChoices[0]?.search?.options).toHaveLength(5);
    expect(getPlayerView(activated, 1).pendingChoices[0]?.search).toBeUndefined();
    expect(getPlayerView(activated, 1).pendingChoices[0]?.optionCount).toBe(5);
    expect(getSpectatorView(activated, 0).pendingChoices[0]?.search).toBeUndefined();
  });

  it("redacts face-down Life identities and private choice events per viewer", () => {
    const events = [
      { type: "life_added" as const, seat: 0 as Seat, defId: "OP09-086", source: "deck_top" as const },
      { type: "life_taken" as const, seat: 0 as Seat, defId: "OP09-095", toHand: true },
      {
        type: "pending_choice_added" as const,
        seat: 0 as Seat,
        kind: "life_trigger" as const,
        cardDefId: "OP12-112",
        optional: true,
        prompt: "Baby 5 — Trigger?",
        privateToSeat: 0 as Seat,
        hideCardDefFromOthers: true,
      },
    ];
    const owner = projectGameEvents(events, 0);
    const opponent = projectGameEvents(events, 1);
    const spectator = projectGameEvents(events, null);
    expect((owner[0] as { defId: string }).defId).toBe("HIDDEN");
    expect((owner[1] as { defId: string }).defId).toBe("OP09-095");
    expect((opponent[1] as { defId: string }).defId).toBe("HIDDEN");
    expect((opponent[2] as { cardDefId: string }).cardDefId).toBe("HIDDEN");
    expect((spectator[2] as { prompt: string }).prompt).not.toMatch(/Baby 5/);
  });

  it("Fullalead asks for its optional hand cost before resting and searching", () => {
    const state = mainState();
    state.players[0].stage = card("fullalead_1", "OP09-099");
    state.players[0].hand = [card("hand_1", "ST01-003"), card("hand_2", "OP09-086")];
    state.players[0].deck = ["OP09-095", "ST01-008", "OP09-086", "ST01-009"];
    const activated = applyIntent(
      state,
      { type: "activate_ability", sourceId: "fullalead_1", abilityId: ABILITY_FULLALEAD_SEARCH },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(activated.ok).toBe(true);
    expect(activated.state.players[0].stage?.rested).toBe(false);
    expect(activated.state.pendingChoices[0]?.abilityId).toBe("fullalead_search_cost");

    const paid = applyIntent(
      activated.state,
      { type: "resolve_pending_choice", accept: true, handIndex: 0 },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(paid.ok, paid.error?.message).toBe(true);
    expect(paid.state.players[0].stage?.rested).toBe(true);
    expect(paid.state.players[0].trash).toContain("ST01-003");
    expect(paid.state.pendingChoices[0]?.kind).toBe("search_top_deck");
  });

  it("Moby Dick dispatches its leader-gated On Play search", () => {
    const state = mainState("OP17-001");
    state.players[0].hand = [card("moby_hand", "OP16-021")];
    state.players[0].deck = ["ST01-003", "ST01-006", "OP09-086", "ST01-008"];
    const played = applyIntent(
      state,
      { type: "play_card", handIndex: 0 },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.players[0].stage?.defId).toBe("OP16-021");
    expect(played.state.pendingChoices[0]?.kind).toBe("search_top_deck");
    expect(played.state.pendingChoices[0]?.search?.options).toHaveLength(3);
  });

  it("My Era resolves a filtered Main search and trashes the remainder", () => {
    const state = mainState();
    state.players[0].hand = [card("my_era_hand", "OP09-096")];
    state.players[0].deck = ["OP09-096", "OP09-086", "ST01-008", "ST01-009"];
    const played = applyIntent(
      state,
      { type: "play_card", handIndex: 0 },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(played.ok, played.error?.message).toBe(true);
    expect(played.state.players[0].trash).toContain("OP09-096");
    const choice = played.state.pendingChoices[0]!;
    expect(choice.search?.remainder).toBe("trash");
    expect(choice.search?.options.find((option) => option.defId === "OP09-096")?.eligible).toBe(false);
    const burgess = choice.search!.options.find((option) => option.defId === "OP09-086")!;
    const resolved = resolveSearch(played.state, burgess.id);
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].hand.some((entry) => entry.defId === "OP09-086")).toBe(true);
    expect(resolved.state.players[0].trash).toEqual(
      expect.arrayContaining(["OP09-096", "OP09-096", "ST01-008"]),
    );
    expect(resolved.state.players[0].deck).toEqual(["ST01-009"]);
  });

  it("My Era can activate its Main search when revealed as a Life Trigger", () => {
    const state = mainState();
    state.phase = "damage";
    state.players[0].deck = ["OP09-086", "ST01-008", "ST01-009"];
    state.pendingChoices = [
      {
        id: "life_choice",
        seat: 0,
        kind: "life_trigger",
        cardDefId: "OP09-096",
        optional: true,
        prompt: "My Era...Begins!! — Trigger",
        privateToSeat: 0,
        hideCardDefFromOthers: true,
      },
    ];
    const resolved = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].trash).toContain("OP09-096");
    expect(resolved.state.pendingChoices[0]?.kind).toBe("search_top_deck");
    expect(resolved.state.phase).toBe("damage");
    const option = resolved.state.pendingChoices[0]!.search!.options.find(
      (entry) => entry.defId === "OP09-086",
    )!;
    const completed = resolveSearch(resolved.state, option.id);
    expect(completed.ok, completed.error?.message).toBe(true);
    expect(completed.state.phase).toBe("main");
    expect(completed.state.players[0].hand.some((entry) => entry.defId === "OP09-086")).toBe(true);
  });

  it("resolves conditional Trigger draws and Leader power bonuses", () => {
    const state = mainState();
    state.phase = "damage";
    state.players[0].deck = ["ST01-003", "ST01-008", "ST01-009"];
    state.players[0].leader.defId = "OP16-080";
    state.pendingChoices = [
      {
        id: "baby_trigger",
        seat: 0,
        kind: "life_trigger",
        cardDefId: "OP12-112",
        optional: true,
        prompt: "Baby 5 — Trigger",
        privateToSeat: 0,
        hideCardDefFromOthers: true,
      },
    ];
    const baby = applyIntent(
      state,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(baby.ok, baby.error?.message).toBe(true);
    expect(baby.state.players[0].hand).toHaveLength(7);

    const powerState = mainState();
    powerState.phase = "damage";
    powerState.pendingChoices = [
      {
        id: "snot_trigger",
        seat: 0,
        kind: "life_trigger",
        cardDefId: "OP17-019",
        optional: true,
        prompt: "Snot-Nosed Brats — Trigger",
        privateToSeat: 0,
        hideCardDefFromOthers: true,
      },
    ];
    const power = applyIntent(
      powerState,
      { type: "resolve_pending_choice", accept: true },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(power.ok, power.error?.message).toBe(true);
    expect(getPlayerView(power.state, 0).you.leader.power).toBe(6000);
  });

  it("OP16-118 searches for Monkey.D.Luffy or Whitebeard Pirates cards", () => {
    ensureCardDef("OP16-015");
    const state = mainState();
    state.players[0].costArea = Array.from({ length: 5 }, (_, index) => ({
      id: `don_${index}`,
      rested: false,
      attachedTo: null,
    }));
    state.players[0].hand = [card("ace_1", "OP16-118")];
    state.players[0].deck = ["OP16-015", "OP17-001", "ST01-008", "ST01-009", "ST01-006"];
    const played = applyIntent(
      state,
      { type: "play_card", handIndex: 0 },
      { seat: 0, rng: createSeededRng(1) },
    );
    expect(played.ok, played.error?.message).toBe(true);
    const choice = played.state.pendingChoices[0]!;
    expect(choice.kind).toBe("search_top_deck");
    expect(choice.search?.options.filter((option) => option.eligible).map((option) => option.defId)).toEqual([
      "OP16-015",
      "OP17-001",
    ]);
  });
});
