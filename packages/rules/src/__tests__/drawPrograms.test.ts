import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, createSeededRng } from "../index.js";

function trigger(cardDefId: string, leaderId = "OP16-080") {
  const deck = Array.from({ length: 20 }, () => "ST01-003");
  const state = createMatch({ seed: 30, firstSeat: 0, players: [{ leaderId, deck }, { leaderId: "ST01-001", deck: [...deck] }] });
  state.phase = "main";
  state.pendingChoices = [{ id: "life", kind: "life_trigger", seat: 0, cardDefId, sourceInstanceId: "trigger_card", optional: true, prompt: "Trigger" }];
  return state;
}

describe("declarative draw Triggers", () => {
  it.each(["OP12-112", "OP16-108"])("%s draws exactly two and disposes of the Trigger without leaving a frame", (cardId) => {
    const state = trigger(cardId);
    const expectedIds = state.players[0].zoneInstanceIds.deck.slice(0, 2);
    const initialHandSize = state.players[0].hand.length;
    const result = applyIntent(state, { type: "resolve_pending_choice", accept: true }, { seat: 0, rng: createSeededRng(30) });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(initialHandSize + 2);
    expect(result.state.players[0].hand.slice(-2).map((card) => card.id)).toEqual(expectedIds);
    expect(result.state.players[0].zoneInstanceIds.trash).toContain("trigger_card");
    expect(result.events.filter((event) => event.type === "drew")).toEqual([{ type: "drew", seat: 0, count: 2 }]);
    expect(result.state.resolutionFrames).toEqual([]);
  });

  it("Baby 5's multicolored condition prevents drawing under a monocolored Leader", () => {
    const state = trigger("OP12-112", "ST01-001");
    const result = applyIntent(state, { type: "resolve_pending_choice", accept: true }, { seat: 0, rng: createSeededRng(30) });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toEqual(state.players[0].hand);
    expect(result.state.players[0].trash).toContain("OP12-112");
    expect(result.events.some((event) => event.type === "drew")).toBe(false);
  });

  it("declining a draw Trigger takes the original copy to hand without drawing", () => {
    const state = trigger("OP16-108");
    const result = applyIntent(state, { type: "resolve_pending_choice", accept: false }, { seat: 0, rng: createSeededRng(30) });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand.at(-1)).toMatchObject({ id: "trigger_card", defId: "OP16-108" });
    expect(result.state.players[0].deck).toEqual(state.players[0].deck);
  });

  it("deck-out terminates the program without a dangling continuation", () => {
    const state = trigger("OP16-108");
    state.players[0].deck = ["ST01-003"];
    state.players[0].zoneInstanceIds.deck = ["last_card"];
    const result = applyIntent(state, { type: "resolve_pending_choice", accept: true }, { seat: 0, rng: createSeededRng(30) });
    expect(result.ok).toBe(true);
    expect(result.state.winner).toBe(1);
    expect(result.state.phase).toBe("game_over");
    expect(result.state.resolutionFrames).toEqual([]);
    expect(result.state.pendingChoices).toEqual([]);
  });
});
