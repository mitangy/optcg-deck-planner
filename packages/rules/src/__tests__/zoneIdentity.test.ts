import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, createSeededRng, getPlayerView } from "../index.js";

function state() {
  const deck = Array.from({ length: 20 }, () => "ST01-003");
  const state = createMatch({ seed: 21, firstSeat: 0, players: [{ leaderId: "OP16-080", deck }, { leaderId: "ST01-001", deck: [...deck] }] });
  state.phase = "main";
  state.activeSeat = 0;
  return state;
}
const card = (id: string, defId: string) => ({ id, defId, rested: false, attachedDonIds: [] });

describe("zone movement identity", () => {
  it("selects the second duplicate through a private option and rejects a stale copy", () => {
    const initial = state();
    initial.players[0].hand = [card("vortex", "OP16-115")];
    initial.players[0].costArea = [{ id: "don", rested: false, attachedTo: null }];
    initial.players[0].trash = ["OP12-112", "OP12-112"];
    initial.players[0].zoneInstanceIds.trash = ["baby_a", "baby_b"];
    const played = applyIntent(initial, { type: "play_card", handIndex: 0 }, { seat: 0, rng: createSeededRng(21) });
    expect(played.ok, played.error?.message).toBe(true);
    const options = played.state.pendingChoices[0]!.trashOptions!.filter((option) => option.defId === "OP12-112");
    expect(options[0]!.id).not.toBe(options[1]!.id);
    const view = getPlayerView(played.state, 0);
    expect(JSON.stringify(view.pendingChoices)).not.toContain("baby_a");
    expect(JSON.stringify(view.pendingChoices)).not.toContain("baby_b");
    const intent = { type: "resolve_pending_choice" as const, accept: true, selectedTrashOptionId: options[1]!.id };
    const resolved = applyIntent(played.state, intent, { seat: 0, rng: createSeededRng(21) });
    expect(resolved.ok, resolved.error?.message).toBe(true);
    expect(resolved.state.players[0].hand[0]?.id).toBe("baby_b");
    expect(resolved.state.players[0].zoneInstanceIds.trash).toContain("baby_a");
    const stale = structuredClone(played.state);
    stale.players[0].zoneInstanceIds.trash[1] = "different_copy";
    const rejected = applyIntent(stale, intent, { seat: 0, rng: createSeededRng(21) });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toEqual(stale);
  });

  it("retrieving a middle trash card preserves that copy and the identities on either side", () => {
    const initial = state();
    initial.players[0].trash = ["OP12-112", "OP16-104", "OP12-112"];
    initial.players[0].zoneInstanceIds.trash = ["baby_a", "devon", "baby_b"];
    initial.pendingChoices = [{ id: "retrieve", kind: "optional_ability", seat: 0, cardDefId: "OP16-115", optional: true, prompt: "Retrieve", abilityId: "main_trash_trigger_to_hand", trashOptions: [{ id: "option", instanceId: "devon", defId: "OP16-104", eligible: true }] }];
    const result = applyIntent(initial, { type: "resolve_pending_choice", accept: true, selectedTrashOptionId: "option" }, { seat: 0, rng: createSeededRng(21) });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.state.players[0].hand.find((entry) => entry.defId === "OP16-104")?.id).toBe("devon");
    expect(result.state.players[0].zoneInstanceIds.trash).toEqual(["baby_a", "baby_b"]);
    expect(result.events).toContainEqual({ type: "card_revealed", seat: 0, defId: "OP16-104", matchedTrait: true });
    expect(initial.players[0].zoneInstanceIds.trash).toEqual(["baby_a", "devon", "baby_b"]);
  });

  it("Stage replacement preserves both the discarded and entering instance IDs", () => {
    const initial = state();
    initial.players[0].stage = card("old_stage", "OP09-099");
    initial.players[0].hand = [card("new_stage", "OP16-021")];
    initial.players[0].costArea = [{ id: "don", rested: false, attachedTo: null }];
    const result = applyIntent(initial, { type: "play_card", handIndex: 0 }, { seat: 0, rng: createSeededRng(21) });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.state.players[0].stage?.id).toBe("new_stage");
    expect(result.state.players[0].trash).toEqual(["OP09-099"]);
    expect(result.state.players[0].zoneInstanceIds.trash).toEqual(["old_stage"]);
  });
});
